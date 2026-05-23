export interface Variable {
    key: string
    value: string
    enabled: boolean
    auto?: boolean
}

export interface Environment {
    id: string
    name: string
    variables: Variable[]
}

export interface ExtractionRule {
    id: string
    name: string
    jsonPath: string
    targetEnvironmentId?: string
}

export interface AuthConfig {
    type: 'none' | 'basic' | 'bearer' | 'apikey'
    basicUsername?: string
    basicPassword?: string
    bearerToken?: string
    apiKeyKey?: string
    apiKeyValue?: string
    apiKeyAddTo?: 'header' | 'query'
}

export interface RequestSettings {
    followRedirects: boolean
    maxRedirects: number
    verifySsl: boolean
}

export interface RequestItem {
    id: string
    itemType?: 'request' | 'divider' | 'folder'
    name: string
    method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'OPTIONS' | 'HEAD'
    url: string
    headers: Variable[]
    queryParams: Variable[]
    bodyType: 'none' | 'json' | 'form-data' | 'x-www-form-urlencoded' | 'raw' | 'binary'
    bodyRaw: string
    bodyFormData: { key: string; value: string; type: 'text' | 'file'; enabled: boolean }[]
    bodyFormUrlEncoded: Variable[]
    bodyBinaryPath: string
    extractionRules: ExtractionRule[]
    auth: AuthConfig
    settings: RequestSettings
    dependencies?: string[]
    localVariables?: Variable[]
    folderId?: string
    collapsed?: boolean
}

export interface PreRequestLog {
    requestId: string
    requestName: string
    status: number
    timeMs: number
    extractedVariables: { key: string; value: string }[]
    error?: string
    responseBody?: string
}

export interface UiSettings {
    sidebarWidth?: number
    folderState?: Record<string, boolean>
}

export interface CollectionData {
    environments: Environment[]
    requests: RequestItem[]
    activeEnvironmentId: string | null
    uiSettings?: UiSettings
}
