import * as React from 'react'
import { RequestItem } from '../types'

export const PreRequestsTab = ({ request, collectionData, onChange }: any) => {

    const availableRequests = collectionData.requests.filter((r: RequestItem) => r.id !== request.id && r.itemType !== 'divider')
    const dependencies: string[] = request.dependencies || []

    const addDependency = (id: string) => {
        if (!dependencies.includes(id)) {
            onChange({ ...request, dependencies: [...dependencies, id] })
        }
    }

    const removeDependency = (index: number) => {
        const newDeps = [...dependencies]
        newDeps.splice(index, 1)
        onChange({ ...request, dependencies: newDeps })
    }

    const moveDependency = (index: number, dir: number) => {
        if (index + dir < 0 || index + dir >= dependencies.length) return
        const newDeps = [...dependencies]
        const temp = newDeps[index]
        newDeps[index] = newDeps[index + dir]
        newDeps[index + dir] = temp
        onChange({ ...request, dependencies: newDeps })
    }

    const [searchQuery, setSearchQuery] = React.useState('')
    const [dropdownOpen, setDropdownOpen] = React.useState(false)

    const filteredRequests = availableRequests.filter((r: RequestItem) => {
        const nameMatch = (r.name || '').toLowerCase().includes(searchQuery.toLowerCase())
        const urlMatch = (r.url || '').toLowerCase().includes(searchQuery.toLowerCase())
        return nameMatch || urlMatch
    })

    return (
        <div style={{ padding: '10px 0' }}>
            <p style={{ fontSize: '0.85em', color: 'var(--text-muted)', marginBottom: '15px' }}>
                Select other requests to run sequentially before this one. Variables extracted from their responses will be available here.
            </p>

            <div style={{ marginBottom: '15px', position: 'relative' }}>
                <input
                    className="obsidian-request-kv-input"
                    type="text"
                    placeholder="Search request to add..."
                    value={searchQuery}
                    onChange={e => {
                        setSearchQuery(e.target.value)
                        setDropdownOpen(true)
                    }}
                    onFocus={() => setDropdownOpen(true)}
                    onBlur={() => setTimeout(() => setDropdownOpen(false), 200)}
                    style={{ width: '100%' }}
                />
                {dropdownOpen && (
                    <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, maxHeight: '200px', overflowY: 'auto', background: 'var(--background-secondary)', border: '1px solid var(--background-modifier-border)', borderRadius: '4px', zIndex: 10, boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}>
                        {filteredRequests.length > 0 ? filteredRequests.map((r: RequestItem) => (
                            <div
                                key={r.id}
                                style={{ padding: '8px 10px', cursor: 'pointer', borderBottom: '1px solid var(--background-modifier-border)' }}
                                onMouseDown={() => {
                                    addDependency(r.id)
                                    setSearchQuery('')
                                    setDropdownOpen(false)
                                }}
                            >
                                <div style={{ fontWeight: 'bold', fontSize: '12px' }}>
                                    <span style={{ fontSize: '10px', color: 'var(--color-orange)', marginRight: '6px' }}>{r.method}</span>
                                    {r.name}
                                </div>
                            </div>
                        )) : (
                            <div style={{ padding: '10px', color: 'var(--text-muted)', fontSize: '12px' }}>No matches found.</div>
                        )}
                    </div>
                )}
            </div>

            {dependencies.length > 0 ? (
                <div style={{ border: '1px solid var(--background-modifier-border)', borderRadius: '4px', overflow: 'hidden' }}>
                    {dependencies.map((depId, i) => {
                        const depReq = collectionData.requests.find((r: RequestItem) => r.id === depId)
                        return (
                            <div key={depId + i} className="obsidian-request-kv-row" style={{ padding: '4px 8px', margin: 0, borderBottom: i < dependencies.length - 1 ? '1px solid var(--background-modifier-border)' : 'none', background: 'var(--background-secondary)', fontSize: '0.9em' }}>
                                <div style={{ display: 'flex', gap: '2px', marginRight: '10px' }}>
                                    <button className="btn-ghost" style={{ padding: '2px 4px', fontSize: '10px' }} disabled={i === 0} onClick={() => moveDependency(i, -1)}>▲</button>
                                    <button className="btn-ghost" style={{ padding: '2px 4px', fontSize: '10px' }} disabled={i === dependencies.length - 1} onClick={() => moveDependency(i, 1)}>▼</button>
                                </div>
                                <span style={{ flex: 1, fontWeight: '600' }}>
                                    <span style={{ fontSize: '9px', padding: '1px 4px', marginRight: '6px', background: 'var(--background-modifier-border)', borderRadius: '3px' }}>{depReq?.method || 'N/A'}</span>
                                    {depReq ? depReq.name : 'Unknown Request'}
                                </span>
                                <button className="btn-ghost" style={{ padding: '2px 6px' }} onClick={() => removeDependency(i)}>✕</button>
                            </div>
                        )
                    })}
                </div>
            ) : (
                <div style={{ color: 'var(--text-muted)', fontStyle: 'italic', fontSize: '0.9em' }}>No dependencies selected.</div>
            )}
        </div>
    )
}
