export function formatAndHighlightResponseBody(text: string | null | undefined, contentType?: string): { isHtml: boolean, content: string } {
    if (!text) return { isHtml: false, content: 'Empty body' }

    // Check if JSON
    if (contentType?.includes('json') || (text.trim().startsWith('{') || text.trim().startsWith('['))) {
        try {
            const jsonObj = JSON.parse(text)
            const jsonStr = JSON.stringify(jsonObj, null, 2)
            // Basic syntax highlighting
            const highlighted = jsonStr.replace(/("(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d*)?(?:[eE][+\-]?\d+)?)/g, function (match) {
                let cls = 'json-number'
                if (/^"/.test(match)) {
                    if (/:$/.test(match)) {
                        cls = 'json-key'
                    } else {
                        cls = 'json-string'
                    }
                } else if (/true|false/.test(match)) {
                    cls = 'json-boolean'
                } else if (/null/.test(match)) {
                    cls = 'json-null'
                }
                return `<span class="${cls}">${match}</span>`
            })
            return { isHtml: true, content: highlighted }
        } catch(e) {}
    }

    // Check if XML/HTML
    if (text.trim().startsWith('<') && (text.includes('xml') || contentType?.includes('xml') || contentType?.includes('html'))) {
        let formatted = ''
        let pad = 0
        text.split(/(?=(?:<[^>]+>))/).forEach((node: string) => {
            if (node.match(/^<\w[^>]*[^\/]>.*$/)) {
                formatted += '  '.repeat(pad) + node + '\n'
                pad += 1
            } else if (node.match(/^<\/\w/)) {
                if (pad !== 0) pad -= 1
                formatted += '  '.repeat(pad) + node + '\n'
            } else {
                formatted += '  '.repeat(pad) + node + '\n'
            }
        })

        // Escape HTML to prevent injection, since we aren't highlighting it, just formatting it
        const escaped = (formatted || text)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;')

        return { isHtml: true, content: escaped }
    }

    return { isHtml: false, content: text }
}
