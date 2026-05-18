import { describe, it, expect } from 'vitest'
import { normalizeRequest, DEFAULT_COLLECTION_DATA, getCollectionNameFromNotePath } from './storage'
import { DEFAULT_AUTO_HEADERS } from './constants'

describe('normalizeRequest', () => {
    it('should normalize a basic request', () => {
        const req = {
            id: '123',
            name: 'Test Request',
            method: 'GET',
            url: 'https://api.example.com'
        }

        const normalized = normalizeRequest(req)

        expect(normalized.id).toBe('123')
        expect(normalized.name).toBe('Test Request')
        expect(normalized.method).toBe('GET')
        expect(normalized.url).toBe('https://api.example.com')
        expect(normalized.bodyType).toBe('none')
        expect(normalized.headers).toBeDefined()
    })

    it('should handle divider items', () => {
        const divider = {
            id: '456',
            name: 'API Section',
            itemType: 'divider'
        }

        const normalized = normalizeRequest(divider)

        expect(normalized.itemType).toBe('divider')
        expect(normalized.name).toBe('API Section')
    })

    it('should add auto headers', () => {
        const req = {
            id: '789',
            name: 'Request',
            headers: []
        }

        const normalized = normalizeRequest(req)

        expect(normalized.headers.length).toBeGreaterThanOrEqual(DEFAULT_AUTO_HEADERS.length)
    })

    it('should not duplicate existing auto headers', () => {
        const req = {
            id: '789',
            name: 'Request',
            headers: [
                { key: 'Accept', value: 'application/json', enabled: true, auto: true }
            ]
        }

        const normalized = normalizeRequest(req)

        const acceptHeaders = normalized.headers.filter(h => h.key === 'Accept' && h.auto)
        expect(acceptHeaders.length).toBe(1)
    })

    it('should set default values for missing fields', () => {
        const req = { id: '1' }

        const normalized = normalizeRequest(req)

        expect(normalized.bodyRaw).toBe('')
        expect(normalized.bodyFormData).toEqual([])
        expect(normalized.bodyFormUrlEncoded).toEqual([])
        expect(normalized.bodyBinaryPath).toBe('')
        expect(normalized.extractionRules).toEqual([])
        expect(normalized.auth).toEqual({ type: 'none' })
        expect(normalized.settings).toEqual({ followRedirects: true, maxRedirects: 5, verifySsl: true })
        expect(normalized.dependencies).toEqual([])
        expect(normalized.localVariables).toEqual([])
    })

    it('should handle null input', () => {
        expect(normalizeRequest(null)).toBe(null)
        expect(normalizeRequest(undefined)).toBe(undefined)
    })
})

describe('DEFAULT_COLLECTION_DATA', () => {
    it('should have default environment', () => {
        expect(DEFAULT_COLLECTION_DATA.environments.length).toBe(1)
        expect(DEFAULT_COLLECTION_DATA.environments[0].id).toBe('default-env')
        expect(DEFAULT_COLLECTION_DATA.environments[0].name).toBe('Local')
    })

    it('should have empty requests array', () => {
        expect(DEFAULT_COLLECTION_DATA.requests).toEqual([])
    })

    it('should have default active environment', () => {
        expect(DEFAULT_COLLECTION_DATA.activeEnvironmentId).toBe('default-env')
    })
})

describe('getCollectionNameFromNotePath', () => {
    it('should extract name from simple note path', () => {
        expect(getCollectionNameFromNotePath('MyNote.md')).toBe('MyNote')
    })

    it('should extract name from nested note path', () => {
        expect(getCollectionNameFromNotePath('folder/subfolder/MyNote.md')).toBe('MyNote')
    })

    it('should handle path without .md extension', () => {
        expect(getCollectionNameFromNotePath('MyNote')).toBe('MyNote')
    })

    it('should handle path with spaces', () => {
        expect(getCollectionNameFromNotePath('My API Collection.md')).toBe('My API Collection')
    })

    it('should handle deep nested path', () => {
        expect(getCollectionNameFromNotePath('a/b/c/d/DeepNote.md')).toBe('DeepNote')
    })
})
