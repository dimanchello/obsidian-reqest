import { App } from 'obsidian'
import { CollectionData, RequestItem, Variable, ExtractionRule, AuthConfig, RequestSettings } from './types'
import { DEFAULT_AUTO_HEADERS } from './constants'

export const COLLECTIONS_DIR = 'collections'

export const DEFAULT_COLLECTION_DATA: CollectionData = {
    environments: [{ id: 'default-env', name: 'Local', variables: [] }],
    requests: [],
    activeEnvironmentId: 'default-env'
}

export function getCollectionNameFromNotePath(notePath: string): string {
    const basename = notePath.split('/').pop() ?? notePath
    return basename.replace(/\.md$/, '')
}

export function getCollectionsDir(pluginDir: string): string {
    return `${pluginDir}/${COLLECTIONS_DIR}`
}

export function normalizeRequest(req: unknown): RequestItem {
    if (!req) return req as RequestItem

    const reqAny = req as Record<string, unknown>

    if (reqAny.itemType === 'divider' || reqAny.itemType === 'folder') {
        return {
            ...reqAny,
            itemType: reqAny.itemType
        } as RequestItem
    }

    const headers = (reqAny.headers as Variable[]) ?? []
    const existingAutoKeys = new Set(headers.filter((h: Variable) => h.auto).map((h: Variable) => h.key))
    const missingAutoHeaders = DEFAULT_AUTO_HEADERS.filter(h => !existingAutoKeys.has(h.key))
    const mergedHeaders = [...missingAutoHeaders, ...headers]

    return {
        id: reqAny.id as string ?? '',
        itemType: (reqAny.itemType as 'request' | 'folder') ?? 'request',
        name: reqAny.name as string ?? 'Unnamed Request',
        method: (reqAny.method as RequestItem['method']) ?? 'GET',
        url: reqAny.url as string ?? '',
        headers: mergedHeaders,
        queryParams: (reqAny.queryParams as Variable[]) ?? [],
        bodyType: (reqAny.bodyType as RequestItem['bodyType']) ?? 'none',
        bodyRaw: reqAny.bodyRaw as string ?? '',
        bodyFormData: (reqAny.bodyFormData as RequestItem['bodyFormData']) ?? [],
        bodyFormUrlEncoded: (reqAny.bodyFormUrlEncoded as Variable[]) ?? [],
        bodyBinaryPath: reqAny.bodyBinaryPath as string ?? '',
        extractionRules: (reqAny.extractionRules as ExtractionRule[]) ?? [],
        auth: (reqAny.auth as AuthConfig) ?? { type: 'none' },
        settings: (reqAny.settings as RequestSettings) ?? { followRedirects: true, maxRedirects: 5, verifySsl: true },
        dependencies: (reqAny.dependencies as string[]) ?? [],
        localVariables: (reqAny.localVariables as Variable[]) ?? [],
        folderId: reqAny.folderId as string ?? undefined,
        collapsed: reqAny.collapsed as boolean ?? undefined
    }
}

async function ensureCollectionsDir(app: App, pluginDir: string): Promise<void> {
    const adapter = app.vault.adapter
    const dir = getCollectionsDir(pluginDir)

    if (!(await adapter.exists(dir))) {
        await adapter.mkdir(dir)
    }
}

export async function loadCollection(app: App, pluginDir: string, collectionName: string): Promise<CollectionData> {
    const adapter = app.vault.adapter

    try {
        await ensureCollectionsDir(app, pluginDir)

        const filePath = `${getCollectionsDir(pluginDir)}/${collectionName}.json`

        if (await adapter.exists(filePath)) {
            const content = await adapter.read(filePath)
            const parsed = JSON.parse(content) as CollectionData

            if (parsed && Array.isArray(parsed.requests)) {
                parsed.requests = parsed.requests.map(normalizeRequest)
            }

            return parsed
        }

        const defaultData = { ...DEFAULT_COLLECTION_DATA }
        await saveCollection(app, pluginDir, collectionName, defaultData)
        return defaultData
    } catch (e) {
        console.error('Failed to load collection:', e)
        return DEFAULT_COLLECTION_DATA
    }
}

export async function saveCollection(app: App, pluginDir: string, collectionName: string, data: CollectionData): Promise<void> {
    const adapter = app.vault.adapter

    try {
        await ensureCollectionsDir(app, pluginDir)

        const filePath = `${getCollectionsDir(pluginDir)}/${collectionName}.json`
        const jsonString = JSON.stringify(data, null, 2)
        await adapter.write(filePath, jsonString)
    } catch (e) {
        console.error('Failed to save collection:', e)
    }
}

export async function renameCollection(app: App, pluginDir: string, oldName: string, newName: string): Promise<void> {
    const adapter = app.vault.adapter

    try {
        await ensureCollectionsDir(app, pluginDir)

        const oldPath = `${getCollectionsDir(pluginDir)}/${oldName}.json`
        const newPath = `${getCollectionsDir(pluginDir)}/${newName}.json`

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

export async function deleteCollection(app: App, pluginDir: string, collectionName: string): Promise<void> {
    const adapter = app.vault.adapter

    try {
        const filePath = `${getCollectionsDir(pluginDir)}/${collectionName}.json`
        if (await adapter.exists(filePath)) {
            await adapter.remove(filePath)
        }
    } catch (e) {
        console.error('Failed to delete collection:', e)
    }
}
