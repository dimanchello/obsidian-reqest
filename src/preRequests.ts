import { CollectionData, ExtractionRule, PreRequestLog } from './types'
import { executeRequest } from './network'
import { JSONPath } from 'jsonpath-plus'

// Internal helper that only executes a single request without traversing its dependencies
async function executeSingleRequest(
    reqId: string,
    collectionData: CollectionData,
    onExtract: (envId: string, key: string, value: string, isLocal: boolean, localReqId?: string) => void,
    onProgress: (status: string) => void,
    contextReqId: string,
    logs: PreRequestLog[],
    localScopeCache: Record<string, string>
) {

    const request = collectionData.requests.find(r => r.id === reqId)
    if (!request) {
        const err = `Request ${reqId} not found`
        logs.push({ requestId: reqId, requestName: 'Unknown', status: 0, timeMs: 0, extractedVariables: [], error: err })
        return { error: err, timeMs: 0 }
    }

    try {
        onProgress(`Running: ${request.name}`)
        const res = await executeRequest(request, collectionData, localScopeCache)

        const extractedVars: { key: string; value: string }[] = []

        const jsonBody = res.response?.json
        if (jsonBody) {
            request.extractionRules.forEach((rule: ExtractionRule) => {
                try {
                    const result = JSONPath({ path: rule.jsonPath, json: jsonBody as object })
                    if (result && result.length > 0) {
                        const val = typeof result[0] === 'object' ? JSON.stringify(result[0]) : String(result[0])
                        const targetEnvId = rule.targetEnvironmentId ?? collectionData.activeEnvironmentId ?? ''

                        const contextReq = collectionData.requests.find(r => r.id === contextReqId)
                        const hasLocal = contextReq?.localVariables?.find(v => v.key === rule.name)

                        let isLocal = false
                        if (hasLocal) {
                            isLocal = true
                        } else {
                            const env = collectionData.environments.find(e => e.id === targetEnvId)
                            const hasGlobal = env?.variables.find(v => v.key === rule.name)
                            if (!hasGlobal) {
                                isLocal = true
                            }
                        }

                        if (isLocal) {
                            onExtract('', rule.name, val, true, contextReqId)
                            extractedVars.push({ key: `(local) ${rule.name}`, value: val })
                            localScopeCache[rule.name] = val
                        } else if (targetEnvId) {
                            onExtract(targetEnvId, rule.name, val, false)
                            extractedVars.push({ key: rule.name, value: val })
                        }
                    }
                } catch { /* empty */ }
            })
        }

        logs.push({
            requestId: request.id,
            requestName: request.name,
            status: res.response?.status ?? 0,
            timeMs: res.timeMs,
            extractedVariables: extractedVars,
            error: res.error,
            responseBody: res.response?.text
        })

        return res
    } catch (e: unknown) {
        const message = e instanceof Error ? e.message : String(e)
        logs.push({
            requestId: request.id,
            requestName: request.name,
            status: 0,
            timeMs: 0,
            extractedVariables: [],
            error: message
        })
        return { error: message, timeMs: 0 }
    }
}

export async function executeWithDependencies(
    mainReqId: string,
    collectionData: CollectionData,
    onExtract: (envId: string, key: string, value: string, isLocal: boolean, localReqId?: string) => void,
    onProgress: (status: string) => void
) {

    const request = collectionData.requests.find(r => r.id === mainReqId)
    if (!request) {
        return { error: `Request ${mainReqId} not found`, timeMs: 0, logs: [] }
    }

    const logs: PreRequestLog[] = []
    const localScopeCache: Record<string, string> = {}

    // Initialize local scope cache
    if (request.localVariables) {
        request.localVariables.forEach(v => {
            if (v.enabled) localScopeCache[v.key] = v.value
        })
    }

    // Execute only the flat dependencies specified on the main request
    if (request.dependencies && request.dependencies.length > 0) {
        for (const depId of request.dependencies) {
            const depResult = await executeSingleRequest(depId, collectionData, onExtract, onProgress, mainReqId, logs, localScopeCache)
            if (depResult.error) {
                return { error: `Failed dependency [${depId}]: ${depResult.error}`, timeMs: 0, logs }
            }
        }
    }

    try {
        onProgress(`Running: ${request.name}`)
        const res = await executeRequest(request, collectionData, localScopeCache)

        const extractedVars: { key: string; value: string }[] = []

        const jsonBody = res.response?.json
        if (jsonBody) {
            request.extractionRules.forEach((rule: ExtractionRule) => {
                try {
                    const result = JSONPath({ path: rule.jsonPath, json: jsonBody as object })
                    if (result && result.length > 0) {
                        const val = typeof result[0] === 'object' ? JSON.stringify(result[0]) : String(result[0])
                        const targetEnvId = rule.targetEnvironmentId ?? collectionData.activeEnvironmentId ?? ''

                        // Check if variable exists in local context, otherwise global. If neither, force local.
                        const contextReq = collectionData.requests.find(r => r.id === mainReqId)
                        const hasLocal = contextReq?.localVariables?.find(v => v.key === rule.name)

                        let isLocal = false
                        if (hasLocal) {
                            isLocal = true
                        } else {
                            const env = collectionData.environments.find(e => e.id === targetEnvId)
                            const hasGlobal = env?.variables.find(v => v.key === rule.name)
                            if (!hasGlobal) {
                                isLocal = true // Force local if neither exists
                            }
                        }

                        if (isLocal) {
                            onExtract('', rule.name, val, true, mainReqId)
                            extractedVars.push({ key: `(local) ${rule.name}`, value: val })
                            localScopeCache[rule.name] = val
                        } else if (targetEnvId) {
                            onExtract(targetEnvId, rule.name, val, false)
                            extractedVars.push({ key: rule.name, value: val })
                        }
                    }
                } catch { /* empty */ }
            })
        }

        // Only log if it's a dependency (not the main request itself, though logging main is fine too)
        // We log everything, the UI can filter out the main request if needed.
        logs.push({
            requestId: request.id,
            requestName: request.name,
            status: res.response?.status ?? 0,
            timeMs: res.timeMs,
            extractedVariables: extractedVars,
            error: res.error,
            responseBody: res.response?.text
        })

        return { ...res, logs }
    } catch (e: unknown) {
        const message = e instanceof Error ? e.message : String(e)
        logs.push({
            requestId: request.id,
            requestName: request.name,
            status: 0,
            timeMs: 0,
            extractedVariables: [],
            error: message
        })
        return { error: message, timeMs: 0, logs }
    }
}
