import { App } from 'obsidian'
import { CollectionData, RequestItem } from './types'
import { DEFAULT_AUTO_HEADERS } from './constants'

export const COLLECTIONS_DIR = 'collections'

export const DEFAULT_COLLECTION_DATA: CollectionData = {
    environments: [{ id: 'default-env', name: 'Local', variables: [] }],
    requests: [],
    activeEnvironmentId: 'default-env'
}

export function getCollectionNameFromNotePath(notePath: string): string {
    const basename = notePath.split('/').pop() || notePath
    return basename.replace(/\.md$/, '')
}

export function normalizeRequest(req: unknown): RequestItem {
    if (!req) return req as RequestItem

    const reqAny = req as Record<string, unknown>

    if (reqAny.itemType === 'divider') {
        return {
            ...reqAny,
            itemType: 'divider'
        } as RequestItem
    }

    const headers = (reqAny.headers as any[]) || []
    const existingAutoKeys = new Set(headers.filter((h: any) => h.auto).map((h: any) => h.key))
    const missingAutoHeaders = DEFAULT_AUTO_HEADERS.filter(h => !existingAutoKeys.has(h.key))
    const mergedHeaders = [...missingAutoHeaders, ...headers]

    return {
        id: reqAny.id as string || '',
        itemType: (reqAny.itemType as 'request' | 'divider') || 'request',
        name: reqAny.name as string || 'Unnamed Request',
        method: (reqAny.method as any) || 'GET',
        url: reqAny.url as string || '',
        headers: mergedHeaders,
        queryParams: (reqAny.queryParams as any[]) || [],
        bodyType: (reqAny.bodyType as any) || 'none',
        bodyRaw: reqAny.bodyRaw as string || '',
        bodyFormData: (reqAny.bodyFormData as any[]) || [],
        bodyFormUrlEncoded: (reqAny.bodyFormUrlEncoded as any[]) || [],
        bodyBinaryPath: reqAny.bodyBinaryPath as string || '',
        extractionRules: (reqAny.extractionRules as any[]) || [],
        auth: (reqAny.auth as any) || { type: 'none' },
        settings: (reqAny.settings as any) || { followRedirects: true, maxRedirects: 5, verifySsl: true },
        dependencies: (reqAny.dependencies as string[]) || [],
        localVariables: (reqAny.localVariables as any[]) || []
    }
}

async function ensureCollectionsDir(adapter: App['vault']['adapter']): Promise<void> {
    if (!(await adapter.exists(COLLECTIONS_DIR))) {
        await adapter.mkdir(COLLECTIONS_DIR)
    }
}

export async function loadCollection(app: App, collectionName: string): Promise<CollectionData> {
    const adapter = app.vault.adapter

    try {
        await ensureCollectionsDir(adapter)

        const filePath = `${COLLECTIONS_DIR}/${collectionName}.json`

        if (await adapter.exists(filePath)) {
            const content = await adapter.read(filePath)
            const parsed = JSON.parse(content) as CollectionData

            if (parsed && Array.isArray(parsed.requests)) {
                parsed.requests = parsed.requests.map(normalizeRequest)
            }

            return parsed
        }

        const defaultData = { ...DEFAULT_COLLECTION_DATA }
        await saveCollection(app, collectionName, defaultData)
        return defaultData
    } catch (e) {
        console.error('Failed to load collection:', e)
        return DEFAULT_COLLECTION_DATA
    }
}

export async function saveCollection(app: App, collectionName: string, data: CollectionData): Promise<void> {
    const adapter = app.vault.adapter

    try {
        await ensureCollectionsDir(adapter)

        const filePath = `${COLLECTIONS_DIR}/${collectionName}.json`
        const jsonString = JSON.stringify(data, null, 2)
        await adapter.write(filePath, jsonString)
    } catch (e) {
        console.error('Failed to save collection:', e)
    }
}

export async function renameCollection(app: App, oldName: string, newName: string): Promise<void> {
    const adapter = app.vault.adapter

    try {
        await ensureCollectionsDir(adapter)

        const oldPath = `${COLLECTIONS_DIR}/${oldName}.json`
        const newPath = `${COLLECTIONS_DIR}/${newName}.json`

        if (await adapter.exists(oldPath)) {
            if (await adapter.exists(newPath)) {
                await adapter.remove(newPath)
            }
            await adapter.rename(oldPath, newPath)
        }
    } catch (e) {
        console.error('Failed to rename collection:', e)
    }
}

export async function deleteCollection(app: App, collectionName: string): Promise<void> {
    const adapter = app.vault.adapter

    try {
        const filePath = `${COLLECTIONS_DIR}/${collectionName}.json`
        if (await adapter.exists(filePath)) {
            await adapter.remove(filePath)
        }
    } catch (e) {
        console.error('Failed to delete collection:', e)
    }
}
