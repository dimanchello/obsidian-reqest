import { describe, it, expect } from 'vitest'
import { formatAndHighlightResponseBody } from './formatter'

describe('formatAndHighlightResponseBody', () => {
    it('should handle empty input', () => {
        const result = formatAndHighlightResponseBody(null)
        expect(result.content).toBe('Empty body')
        expect(result.isHtml).toBe(false)
    })

    it('should handle undefined input', () => {
        const result = formatAndHighlightResponseBody(undefined)
        expect(result.content).toBe('Empty body')
    })

    it('should format and highlight JSON', () => {
        const json = '{"name": "test", "value": 123}'
        const result = formatAndHighlightResponseBody(json, 'application/json')

        expect(result.isHtml).toBe(true)
        expect(result.content).toContain('json-key')
        expect(result.content).toContain('json-string')
        expect(result.content).toContain('json-number')
    })

    it('should detect JSON by content', () => {
        const json = '{"key": "value"}'
        const result = formatAndHighlightResponseBody(json)

        expect(result.isHtml).toBe(true)
    })

    it('should detect JSON array by content', () => {
        const json = '[1, 2, 3]'
        const result = formatAndHighlightResponseBody(json)

        expect(result.isHtml).toBe(true)
    })

    it('should return plain text for non-JSON/XML', () => {
        const text = 'Hello World'
        const result = formatAndHighlightResponseBody(text)

        expect(result.isHtml).toBe(false)
        expect(result.content).toBe('Hello World')
    })

    it('should highlight boolean values', () => {
        const json = '{"active": true, "deleted": false}'
        const result = formatAndHighlightResponseBody(json, 'application/json')

        expect(result.content).toContain('json-boolean')
    })

    it('should highlight null values', () => {
        const json = '{"value": null}'
        const result = formatAndHighlightResponseBody(json, 'application/json')

        expect(result.content).toContain('json-null')
    })

    it('should handle invalid JSON gracefully', () => {
        const invalidJson = '{invalid json}'
        const result = formatAndHighlightResponseBody(invalidJson)

        expect(result.isHtml).toBe(false)
        expect(result.content).toBe('{invalid json}')
    })
})
