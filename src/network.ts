import { requestUrl, RequestUrlParam, RequestUrlResponse } from 'obsidian'
import { CollectionData, RequestItem, Environment } from './types'
import * as fs from 'fs'
import * as http from 'http'
import * as https from 'https'
import FormData from 'form-data'

interface NodeResponse {
    status: number | undefined
    headers: Record<string, string | string[] | undefined>
    contentType: string
    text: string
    json: unknown
    arrayBuffer: ArrayBuffer
    isBinary: boolean
}

type RequestResult = {
    response?: RequestUrlResponse | NodeResponse
    error?: string
    timeMs: number
}

export function substituteVariables(text: string, activeEnvironment?: Environment, localScopeCache?: Record<string, string>): string {
    if (!text) return text
    let result = text

    const regex = /{{([^}]+)}}/g
    result = result.replace(regex, (match, varName) => {
        const localVal = localScopeCache?.[varName]
        if (localVal !== undefined) return localVal
        if (activeEnvironment) {
            const envVar = activeEnvironment.variables.find(v => v.key === varName && v.enabled)
            if (envVar) return envVar.value
        }
        return match
    })

    return result
}

export async function executeRequest(
    request: RequestItem,
    collectionData: CollectionData,
    localScopeCache?: Record<string, string>
): Promise<RequestResult> {
    const activeEnv = collectionData.environments.find(e => e.id === collectionData.activeEnvironmentId)

    let url = substituteVariables(request.url, activeEnv, localScopeCache)

    const activeQueryParams = request.queryParams.filter(p => p.enabled && p.key)
    if (activeQueryParams.length > 0) {
        const urlObj = new URL(url.startsWith('http') ? url : `http://${url}`)
        activeQueryParams.forEach(p => {
            urlObj.searchParams.append(substituteVariables(p.key, activeEnv, localScopeCache), substituteVariables(p.value, activeEnv, localScopeCache))
        })
        url = urlObj.toString()
    }

    const headers: Record<string, string> = {}
    request.headers.filter(h => h.enabled && h.key).forEach(h => {
        headers[substituteVariables(h.key, activeEnv, localScopeCache)] = substituteVariables(h.value, activeEnv, localScopeCache)
    })

    // Apply Auth
    if (request.auth.type === 'basic' && request.auth.basicUsername) {
        const user = substituteVariables(request.auth.basicUsername, activeEnv, localScopeCache)
        const pass = substituteVariables(request.auth.basicPassword ?? '', activeEnv, localScopeCache)
        headers['Authorization'] = `Basic ${Buffer.from(`${user}:${pass}`).toString('base64')}`
    } else if (request.auth.type === 'bearer' && request.auth.bearerToken) {
        headers['Authorization'] = `Bearer ${substituteVariables(request.auth.bearerToken, activeEnv, localScopeCache)}`
    } else if (request.auth.type === 'apikey' && request.auth.apiKeyKey) {
        const key = substituteVariables(request.auth.apiKeyKey, activeEnv, localScopeCache)
        const val = substituteVariables(request.auth.apiKeyValue ?? '', activeEnv, localScopeCache)
        if (request.auth.apiKeyAddTo === 'header') {
            headers[key] = val
        } else {
            const urlObj = new URL(url)
            urlObj.searchParams.append(key, val)
            url = urlObj.toString()
        }
    }

    let body: string | ArrayBuffer | undefined = undefined

    const hasFiles = request.method !== 'GET' && request.method !== 'HEAD' && request.bodyType === 'form-data' && request.bodyFormData.some(f => f.enabled && f.type === 'file' && f.value)
    const hasBinaryBody = request.method !== 'GET' && request.method !== 'HEAD' && request.bodyType === 'binary' && request.bodyBinaryPath
    const requiresNode = hasFiles || hasBinaryBody || request.settings.verifySsl === false

    if (requiresNode) {
        return await executeNodeRequest(url, request, headers, activeEnv)
    }

    if (request.method !== 'GET' && request.method !== 'HEAD') {
        if (request.bodyType === 'json' || request.bodyType === 'raw') {
            body = substituteVariables(request.bodyRaw, activeEnv, localScopeCache)
            if (request.bodyType === 'json' && !headers['Content-Type']) {
                headers['Content-Type'] = 'application/json'
            }
        } else if (request.bodyType === 'form-data') {
            const boundary = `----ObsidianRequestBoundary${Date.now()}`
            headers['Content-Type'] = `multipart/form-data; boundary=${boundary}`

            const parts: string[] = []
            for (const field of request.bodyFormData.filter(f => f.enabled && f.key)) {
                if (field.type === 'text') {
                    parts.push(
                        `--${boundary}\r\n` +
                        `Content-Disposition: form-data; name="${substituteVariables(field.key, activeEnv, localScopeCache)}"\r\n\r\n` +
                        `${substituteVariables(field.value, activeEnv, localScopeCache)}\r\n`
                    )
                }
            }
            parts.push(`--${boundary}--\r\n`)
            body = parts.join('')
        } else if (request.bodyType === 'x-www-form-urlencoded') {
            headers['Content-Type'] = 'application/x-www-form-urlencoded'
            const params = new URLSearchParams()
            for (const field of request.bodyFormUrlEncoded.filter(f => f.enabled && f.key)) {
                params.append(substituteVariables(field.key, activeEnv, localScopeCache), substituteVariables(field.value, activeEnv, localScopeCache))
            }
            body = params.toString()
        }
    }

    const reqParams: RequestUrlParam = {
        url,
        method: request.method,
        headers,
        body,
        throw: false
    }

    const startTime = Date.now()
    try {
        const obsidianResponse = await requestUrl(reqParams)
        const timeMs = Date.now() - startTime

        const contentType = obsidianResponse.headers['content-type']?.toString() ?? ''
        const isBinary = !contentType.includes('text') && !contentType.includes('json') && !contentType.includes('xml')

        let jsonPayload: unknown = null
        if (contentType.includes('json')) {
            jsonPayload = obsidianResponse.json
        }

        return {
            response: {
                status: obsidianResponse.status,
                headers: obsidianResponse.headers,
                contentType,
                text: isBinary ? '' : obsidianResponse.text,
                json: jsonPayload,
                arrayBuffer: obsidianResponse.arrayBuffer,
                isBinary
            },
            timeMs
        }
    } catch (err: unknown) {
        const timeMs = Date.now() - startTime
        return { error: err instanceof Error ? err.message : 'Failed to fetch', timeMs }
    }
}

async function executeNodeRequest(url: string, request: RequestItem, headers: Record<string, string>, activeEnv?: Environment, localScopeCache?: Record<string, string>): Promise<RequestResult> {
    const startTime = Date.now()
    return new Promise<RequestResult>((resolve) => {
        try {
            let reqBody: FormData | fs.ReadStream | null = null
            let reqHeaders = { ...headers }

            if (request.method !== 'GET' && request.method !== 'HEAD') {
                if (request.bodyType === 'form-data') {
                    const form = new FormData()
                    for (const field of request.bodyFormData.filter(f => f.enabled && f.key)) {
                        const fieldName = substituteVariables(field.key, activeEnv, localScopeCache)
                        if (field.type === 'text') {
                            form.append(fieldName, substituteVariables(field.value, activeEnv, localScopeCache))
                        } else if (field.type === 'file' && field.value) {
                            const filePath = substituteVariables(field.value, activeEnv, localScopeCache)
                            if (fs.existsSync(filePath)) {
                                form.append(fieldName, fs.createReadStream(filePath))
                            } else {
                                throw new Error(`File not found: ${filePath}`)
                            }
                        }
                    }
                    reqBody = form
                    reqHeaders = { ...reqHeaders, ...form.getHeaders() }
                } else if (request.bodyType === 'binary') {
                    const filePath = substituteVariables(request.bodyBinaryPath, activeEnv, localScopeCache)
                    if (fs.existsSync(filePath)) {
                        reqBody = fs.createReadStream(filePath)
                        const stats = fs.statSync(filePath)
                        reqHeaders['Content-Length'] = stats.size.toString()
                        reqHeaders['Content-Type'] ??= 'application/octet-stream'
                    } else {
                        throw new Error(`Binary file not found: ${filePath}`)
                    }
                }
            }

            const urlObj = new URL(url)
            const reqOptions: https.RequestOptions = {
                method: request.method,
                headers: reqHeaders,
                rejectUnauthorized: request.settings.verifySsl !== false
            }

            const client = urlObj.protocol === 'https:' ? https : http

            const req = client.request(url, reqOptions, (res) => {
                const chunks: Buffer[] = []
                res.on('data', (chunk) => {
                    chunks.push(Buffer.from(chunk))
                })
                res.on('end', () => {
                    const timeMs = Date.now() - startTime
                    const buffer = Buffer.concat(chunks)
                    const contentType = res.headers['content-type'] ?? ''

                    let text = ''
                    let json: unknown = null
                    const isBinary = !contentType.includes('text') && !contentType.includes('json') && !contentType.includes('xml')

                    if (!isBinary) {
                        text = buffer.toString('utf8')
                        if (contentType.includes('json')) {
                            try { json = JSON.parse(text) } catch { json = null }
                        }
                    }

                    resolve({
                        response: {
                            status: res.statusCode ?? 200,
                            headers: res.headers,
                            contentType,
                            text,
                            json,
                            arrayBuffer: buffer.buffer,
                            isBinary
                        },
                        timeMs
                    })
                })
            })

            req.on('error', (e) => {
                resolve({ error: e.message, timeMs: Date.now() - startTime })
            })

            if (reqBody) {
                if ('pipe' in reqBody) {
                    reqBody.pipe(req)
                } else {
                    req.write(reqBody)
                    req.end()
                }
            } else {
                req.end()
            }
        } catch (e: unknown) {
            resolve({ error: e instanceof Error ? e.message : 'Unknown error', timeMs: Date.now() - startTime })
        }
    })
}
