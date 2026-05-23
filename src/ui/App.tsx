import * as React from 'react'
import { CollectionData, RequestItem, Environment, ExtractionRule, Variable, AuthConfig, PreRequestLog } from '../types'
import { importExternalCollection, exportExternalCollection } from '../importExport'
import { Notice } from 'obsidian'
import { PreRequestsTab } from './PreRequestsTab'
import { executeWithDependencies } from '../preRequests'
import { formatAndHighlightResponseBody, highlightJsonText } from './formatter'

interface AppProps {
    data: CollectionData
    onSave: (data: CollectionData) => void
    collectionName: string
}

const HighlightMatch = ({ text, query }: { text: string, query: string }) => {
    if (!text) return <></>
    if (!query) return <>{text}</>
    const escapedQuery = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const parts = text.split(new RegExp(`(${escapedQuery})`, 'gi'))
    return (
        <>
            {parts.map((part, i) =>
                part.toLowerCase() === query.toLowerCase()
                    ? <mark key={i} style={{ backgroundColor: 'var(--text-highlight-bg, rgba(255, 234, 0, 0.5))', color: 'inherit', borderRadius: '2px', padding: '0 2px' }}>{part}</mark>
                    : <span key={i}>{part}</span>
            )}
        </>
    )
}

export const App: React.FC<AppProps> = ({ data, onSave, collectionName }) => {
    const [collectionData, setCollectionData] = React.useState<CollectionData>(data)
    const [activeReqId, setActiveReqId] = React.useState<string | null>(
        data.requests.length > 0 ? data.requests[0]!.id : null
    )
    const [showEnvManager, setShowEnvManager] = React.useState(false)
    const [mobileSidebarOpen, setMobileSidebarOpen] = React.useState(false)
    const [searchQuery, setSearchQuery] = React.useState('')
    const [sidebarWidth, setSidebarWidth] = React.useState(data.uiSettings?.sidebarWidth ?? 250)
    const [draggedItemId, setDraggedItemId] = React.useState<string | null>(null)
    const [dropTargetId, setDropTargetId] = React.useState<string | null>(null)
    const [dropPosition, setDropPosition] = React.useState<'top' | 'bottom'>('bottom')
    const [showExportModal, setShowExportModal] = React.useState(false)
    const [contextMenu, setContextMenu] = React.useState<{ x: number, y: number, folderId: string } | null>(null)
    const [editingFolderId, setEditingFolderId] = React.useState<string | null>(null)

    React.useEffect(() => {
        setCollectionData(data)
        if (data.uiSettings?.sidebarWidth) {
            setSidebarWidth(data.uiSettings.sidebarWidth)
        }
    }, [data])

    React.useEffect(() => {
        if (contextMenu) {
            const handler = () => setContextMenu(null)
            document.addEventListener('click', handler)
            return () => document.removeEventListener('click', handler)
        }
    }, [contextMenu])

    const startSidebarResizing = React.useCallback((e: React.MouseEvent<HTMLDivElement>) => {
        e.preventDefault()
        const startX = e.clientX
        const startWidth = sidebarWidth

        const doDrag = (dragEvent: MouseEvent) => {
            const deltaX = dragEvent.clientX - startX
            setSidebarWidth(Math.min(Math.max(startWidth + deltaX, 150), 500))
        }

        const stopDrag = (dragEvent: MouseEvent) => {
            document.removeEventListener('mousemove', doDrag)
            document.removeEventListener('mouseup', stopDrag)
            const deltaX = dragEvent.clientX - startX
            const finalWidth = Math.min(Math.max(startWidth + deltaX, 150), 500)
            onSave({ ...collectionData, uiSettings: { ...collectionData.uiSettings, sidebarWidth: finalWidth } })
        }

        document.addEventListener('mousemove', doDrag)
        document.addEventListener('mouseup', stopDrag)
    }, [sidebarWidth, collectionData, onSave])

    const handleSave = (newData: CollectionData) => {
        setCollectionData(newData)
        onSave(newData)
    }

    const activeReq = collectionData.requests.find(r => r.id === activeReqId)

    const isSearching = searchQuery.length > 0
    const searchLower = searchQuery.toLowerCase()

    const matchingItemIds = React.useMemo(() => {
        if (!isSearching) return null
        const matches = new Set<string>()
        const requests = collectionData.requests

        for (const req of requests) {
            const nameMatch = (req.name || '').toLowerCase().includes(searchLower)
            if (req.itemType === 'folder') {
                const childrenMatch = requests.some(
                    r => r.folderId === req.id && (
                        (r.name || '').toLowerCase().includes(searchLower) ||
                        (r.url || '').toLowerCase().includes(searchLower)
                    )
                )
                if (nameMatch || childrenMatch) {
                    matches.add(req.id)
                    for (const child of requests.filter(r => r.folderId === req.id)) {
                        matches.add(child.id)
                    }
                }
            } else {
                const urlMatch = (req.url || '').toLowerCase().includes(searchLower)
                if (nameMatch || urlMatch) {
                    matches.add(req.id)
                    if (req.folderId) matches.add(req.folderId)
                }
            }
        }
        return matches
    }, [collectionData.requests, searchQuery])

    const renderOrder = React.useMemo(() => {
        const order: { id: string, isFolder?: boolean }[] = []

        if (isSearching) {
            const matched = new Set(matchingItemIds ?? [])
            for (const req of collectionData.requests) {
                if (req.itemType === 'folder' && matched.has(req.id)) {
                    order.push({ id: req.id, isFolder: true })
                } else if (matched.has(req.id)) {
                    order.push({ id: req.id })
                }
            }
        } else {
            for (const req of collectionData.requests) {
                if (req.itemType === 'folder') {
                    order.push({ id: req.id, isFolder: true })
                } else if (!req.folderId) {
                    order.push({ id: req.id })
                }
            }
        }

        return order
    }, [collectionData.requests, matchingItemIds, isSearching])

    const isFolderCollapsed = (folderId: string) => {
        if (isSearching) return false
        return collectionData.uiSettings?.folderState?.[folderId] ?? false
    }

    const toggleFolder = (folderId: string) => {
        const currentState = collectionData.uiSettings?.folderState ?? {}
        const newState = { ...currentState, [folderId]: !currentState[folderId] }
        handleSave({ ...collectionData, uiSettings: { ...collectionData.uiSettings, folderState: newState } })
    }

    const handleDragStart = (id: string) => {
        setDraggedItemId(id)
    }

    const handleDragOver = (e: React.DragEvent, id: string) => {
        e.preventDefault()
        setDropTargetId(id)
        const rect = (e.target as HTMLElement).closest('.obsidian-request-request-item, .obsidian-request-folder-header')?.getBoundingClientRect()
        if (rect) {
            const midPoint = rect.top + rect.height / 2
            setDropPosition(e.clientY < midPoint ? 'top' : 'bottom')
        }
    }

    const handleDrop = (e: React.DragEvent, targetId: string) => {
        e.preventDefault()
        if (!draggedItemId || draggedItemId === targetId) {
            setDraggedItemId(null)
            setDropTargetId(null)
            return
        }

        const newRequests = [...collectionData.requests]
        const draggedIdx = newRequests.findIndex(r => r.id === draggedItemId)
        const targetIdx = newRequests.findIndex(r => r.id === targetId)

        if (draggedIdx === -1 || targetIdx === -1) {
            setDraggedItemId(null)
            setDropTargetId(null)
            return
        }

        const draggedItem = newRequests[draggedIdx]
        const targetItem = collectionData.requests.find(r => r.id === targetId)

        if (!targetItem) {
            setDraggedItemId(null)
            setDropTargetId(null)
            return
        }

        // Determine new folderId for dragged item
        let newFolderId: string | undefined
        if (draggedItem.itemType === 'folder') {
            if (targetItem.itemType === 'folder') {
                newFolderId = targetItem.id
            } else {
                newFolderId = targetItem.folderId
            }
        } else {
            if (targetItem.itemType === 'folder') {
                newFolderId = targetItem.id
            } else {
                newFolderId = targetItem.folderId
            }
        }

        // If the item is not changing folder and position is not changing, skip
        const oldFolderId = draggedItem.folderId
        const newPosition = targetIdx + (dropPosition === 'bottom' ? 1 : 0)
        const oldPosition = draggedIdx

        if (oldFolderId === newFolderId && oldPosition === newPosition) {
            setDraggedItemId(null)
            setDropTargetId(null)
            return
        }

        // Update folderId if changed
        if (oldFolderId !== newFolderId) {
            draggedItem.folderId = newFolderId
        }

        // Remove dragged item from its current position
        newRequests.splice(draggedIdx, 1)
        // Insert at new position
        newRequests.splice(newPosition, 0, draggedItem)

        handleSave({ ...collectionData, requests: newRequests })
        setDraggedItemId(null)
        setDropTargetId(null)
    }

    const handleDragEnd = () => {
        setDraggedItemId(null)
        setDropTargetId(null)
    }

    const addNewRequest = (folderId?: string) => {
        const newReq: RequestItem = {
            id: Date.now().toString(),
            itemType: 'request',
            name: 'New Request',
            method: 'GET',
            url: '',
            headers: [],
            queryParams: [],
            bodyType: 'none',
            bodyRaw: '',
            bodyFormData: [],
            bodyFormUrlEncoded: [],
            bodyBinaryPath: '',
            extractionRules: [],
            auth: { type: 'none' },
            settings: { followRedirects: true, maxRedirects: 5, verifySsl: true },
            dependencies: [],
            folderId: folderId ?? undefined
        }
        handleSave({ ...collectionData, requests: [...collectionData.requests, newReq] })
        setActiveReqId(newReq.id)
        if (window.innerWidth <= 768) setMobileSidebarOpen(false)
    }

    const addNewFolder = () => {
        const newFolder: RequestItem = {
            id: Date.now().toString(),
            itemType: 'folder',
            name: 'New Folder',
            method: 'GET',
            url: '',
            headers: [],
            queryParams: [],
            bodyType: 'none',
            bodyRaw: '',
            bodyFormData: [],
            bodyFormUrlEncoded: [],
            bodyBinaryPath: '',
            extractionRules: [],
            auth: { type: 'none' },
            settings: { followRedirects: true, maxRedirects: 5, verifySsl: true },
            dependencies: [],
            localVariables: []
        }
        handleSave({ ...collectionData, requests: [...collectionData.requests, newFolder] })
    }

    const deleteItem = (reqId: string, e: React.MouseEvent) => {
        e.stopPropagation()
        const req = collectionData.requests.find(r => r.id === reqId)
        if (!req) return

        if (req.itemType === 'folder') {
            const childCount = collectionData.requests.filter(r => r.folderId === reqId).length
            if (!confirm(`Delete folder "${req.name}" and all ${childCount} requests inside it?`)) return
            const newReqs = collectionData.requests.filter(r => r.id !== reqId && r.folderId !== reqId)
            handleSave({ ...collectionData, requests: newReqs })
            if (activeReqId === reqId || collectionData.requests.some(r => r.folderId === reqId && r.id === activeReqId)) {
                setActiveReqId(newReqs.find(r => r.itemType !== 'folder')?.id ?? null)
            }
        } else {
            if (!confirm(`Are you sure you want to delete "${req.name}"?`)) return
            const newReqs = collectionData.requests.filter(r => r.id !== reqId)
            handleSave({ ...collectionData, requests: newReqs })
            if (activeReqId === reqId) setActiveReqId(newReqs.find(r => r.itemType !== 'folder')?.id ?? null)
        }
    }

    const handleFolderContextMenu = (e: React.MouseEvent, folderId: string) => {
        e.preventDefault()
        e.stopPropagation()
        const rootEl = (e.currentTarget as HTMLElement).closest('.obsidian-request-root')
        if (!rootEl) return
        const rootRect = rootEl.getBoundingClientRect()
        const menuWidth = 200
        const menuHeight = 120
        let x = e.clientX - rootRect.left
        let y = e.clientY - rootRect.top
        const rootWidth = rootRect.width
        const rootHeight = rootRect.height
        if (x + menuWidth > rootWidth) x = rootWidth - menuWidth
        if (x < 0) x = 0
        if (y + menuHeight > rootHeight) y = rootHeight - menuHeight
        if (y < 0) y = 0
        setContextMenu({ x, y, folderId })
    }

    const handleImport = async () => {
        try {
            const win = window as { require: (mod: string) => unknown }
            const electron = win.require('electron') as { remote: { dialog: { showOpenDialog: (opts: Record<string, unknown>) => Promise<{ canceled: boolean; filePaths: string[] }> } } }
            const fs = win.require('fs') as { readFileSync: (path: string, encoding: string) => string }
            const result = await electron.remote.dialog.showOpenDialog({
                properties: ['openFile'],
                filters: [{ name: 'JSON', extensions: ['json'] }]
            })

            if (!result.canceled && result.filePaths.length > 0) {
                const content = fs.readFileSync(result.filePaths[0]!, 'utf8')

                try {
                    const parsed = JSON.parse(content)
                    if (parsed.requests && Array.isArray(parsed.requests) && parsed.environments) {
                        const nativeReqs = parsed.requests.map((r: Record<string, unknown>) => {
                            return { ...r, id: Date.now().toString() + Math.random().toString(36).substring(7) }
                        })
                        handleSave({ ...collectionData, requests: [...collectionData.requests, ...nativeReqs] })
                        new Notice(`Successfully imported ${nativeReqs.length} requests in native format!`)
                        return
                    }
                } catch { /* empty */ }

                const importedRequests = importExternalCollection(content)
                if (importedRequests.length > 0) {
                    handleSave({ ...collectionData, requests: [...collectionData.requests, ...importedRequests] })
                    new Notice(`Successfully imported ${importedRequests.length} requests!`)
                } else {
                    new Notice('No requests found in the imported file.')
                }
            }
        } catch (err: unknown) {
            new Notice(`Import failed: ${err instanceof Error ? err.message : String(err)}`)
        }
    }

    const handleExport = (format: 'external' | 'native') => {
        try {
            let json = ''
            let filename = ''

            if (format === 'external') {
                json = exportExternalCollection(collectionData, collectionName || 'Obsidian Export')
                filename = `obsidian-request_${Date.now()}.json`
            } else {
                json = JSON.stringify(collectionData, null, 2)
                filename = `obsidian-request-native_${Date.now()}.json`
            }

            const blob = new Blob([json], { type: 'application/json' })
            const url = URL.createObjectURL(blob)
            const a = document.createElement('a')
            a.href = url
            a.download = filename
            document.body.appendChild(a)
            a.click()
            document.body.removeChild(a)
            URL.revokeObjectURL(url)
            new Notice('Collection exported successfully!')
        } catch {
            new Notice('Export failed!')
        }
        setShowExportModal(false)
    }

    const saveFolderName = (folderId: string, newName: string) => {
        const newRequests = collectionData.requests.map(r =>
            r.id === folderId ? { ...r, name: newName } : r
        )
        handleSave({ ...collectionData, requests: newRequests })
        setEditingFolderId(null)
    }



    const renderRequestItem = (req: RequestItem, depth: number, _index: number) => {
        const isDragOver = dropTargetId === req.id
        const dragClass = isDragOver ? (dropPosition === 'top' ? 'drag-over-top' : 'drag-over') : ''

        return (
            <div key={req.id}
                draggable
                onDragStart={() => handleDragStart(req.id)}
                onDragOver={(e) => handleDragOver(e, req.id)}
                onDrop={(e) => handleDrop(e, req.id)}
                onDragEnd={handleDragEnd}
                onClick={() => { setActiveReqId(req.id); if (window.innerWidth <= 768) setMobileSidebarOpen(false) }}
                className={`obsidian-request-request-item ${activeReqId === req.id ? 'active' : ''} ${dragClass}`}
                style={{ marginLeft: `${depth * 16}px` }}>
                <div style={{ display: 'flex', alignItems: 'center', overflow: 'hidden' }}>
                    <span className={`obsidian-request-method-badge method-${req.method}`}>{req.method}</span>
                    <span style={{ fontSize: '13px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}><HighlightMatch text={req.name} query={searchQuery} /></span>
                </div>
                <button className="btn-ghost" onClick={(e) => deleteItem(req.id, e)}>×</button>
            </div>
        )
    }

    const renderFolderItem = (folder: RequestItem) => {
        const collapsed = isFolderCollapsed(folder.id)
        const isDragOver = dropTargetId === folder.id
        const dragClass = isDragOver ? (dropPosition === 'top' ? 'drag-over-top' : 'drag-over') : ''
        const isEditing = editingFolderId === folder.id

        return (
            <div key={folder.id} className={`obsidian-request-folder-container ${collapsed ? 'collapsed' : ''}`}>
                <div
                    draggable
                    onDragStart={isEditing ? (e) => e.preventDefault() : () => handleDragStart(folder.id)}
                    onDragOver={(e) => handleDragOver(e, folder.id)}
                    onDrop={(e) => handleDrop(e, folder.id)}
                    onDragEnd={handleDragEnd}
                    onContextMenu={(e) => handleFolderContextMenu(e, folder.id)}
                    className={`obsidian-request-folder-header ${activeReqId === folder.id ? 'active' : ''} ${dragClass}`}
                    onClick={(e) => { e.stopPropagation(); toggleFolder(folder.id) }}
                >
                    <span className="obsidian-request-folder-toggle">
                        {collapsed ? '📂' : '📁'}
                    </span>
                    {isEditing ? (
                        <FolderNameEditor
                            folder={folder}
                            onSave={(name) => saveFolderName(folder.id, name)}
                            onCancel={() => setEditingFolderId(null)}
                        />
                    ) : (
                        <span
                            className="obsidian-request-folder-name"
                            onDoubleClick={(e) => {
                                e.stopPropagation()
                                setEditingFolderId(folder.id)
                            }}
                        >
                            <HighlightMatch text={folder.name} query={searchQuery} />
                        </span>
                    )}
                    <button className="btn-ghost obsidian-request-folder-delete" onClick={(e) => { e.stopPropagation(); deleteItem(folder.id, e) }}>×</button>
                </div>
                <div className="obsidian-request-folder-children">
                    {collectionData.requests
                        .filter(r => r.folderId === folder.id && r.itemType !== 'folder')
                        .map(child => renderRequestItem(child, 1, 0))}
                </div>
            </div>
        )
    }

    return (
        <>
            <div className="obsidian-request-root">
                <div className={`obsidian-request-sidebar ${mobileSidebarOpen ? 'mobile-open' : ''}`} style={{ width: window.innerWidth > 768 ? `${sidebarWidth}px` : undefined }}>
                    <div className="obsidian-request-sidebar-header">
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                            <label style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Environment</label>
                            <button className="btn-ghost" style={{ padding: '2px 5px', fontSize: '11px' }} onClick={() => setShowEnvManager(true)}>
                            ⚙️
                            </button>
                        </div>
                        <select
                            style={{ width: '100%', background: 'var(--background-modifier-form-field)', color: 'var(--text-normal)', border: '1px solid var(--background-modifier-border)', padding: '5px', borderRadius: '4px' }}
                            value={collectionData.activeEnvironmentId ?? ''}
                            onChange={(e) => handleSave({ ...collectionData, activeEnvironmentId: e.target.value })}
                        >
                            {collectionData.environments.map((env: Environment) => (
                                <option key={env.id} value={env.id}>{env.name}</option>
                            ))}
                        </select>
                    </div>

                    <div style={{ padding: '10px', position: 'relative' }}>
                        <input
                            type="text"
                            placeholder="Search requests..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            onKeyDown={(e) => { if (e.key === 'Escape') setSearchQuery('') }}
                            style={{ width: '100%', background: 'var(--background-modifier-form-field)', color: 'var(--text-normal)', border: '1px solid var(--background-modifier-border)', padding: '5px', borderRadius: '4px', fontSize: '12px' }}
                        />
                        {searchQuery && (
                            <button
                                className="btn-ghost"
                                style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)', padding: '2px 4px', fontSize: '10px' }}
                                onClick={() => setSearchQuery('')}
                            >
                            ✕
                            </button>
                        )}
                    </div>

                    <div className="obsidian-request-request-list">
                        {renderOrder.map((item) => {
                            const req = collectionData.requests.find(r => r.id === item.id)
                            if (!req) return null
                            if (item.isFolder) {
                                return renderFolderItem(req)
                            }
                            return renderRequestItem(req, 0, 0)
                        })}

                        <div style={{ display: 'flex', gap: '5px', marginTop: '10px' }}>
                            <button style={{ flex: 2, background: 'transparent', border: '1px dashed var(--background-modifier-border)', color: 'var(--text-muted)', padding: '6px', borderRadius: '4px', cursor: 'pointer', fontSize: '12px' }} onClick={() => addNewRequest()}>
                            + Request
                            </button>
                            <button style={{ flex: 1, background: 'transparent', border: '1px dashed var(--background-modifier-border)', color: 'var(--text-muted)', padding: '6px', borderRadius: '4px', cursor: 'pointer', fontSize: '12px' }} onClick={addNewFolder}>
                            + Folder
                            </button>
                        </div>
                        <div style={{ display: 'flex', gap: '5px', marginTop: '10px' }}>
                            <button className="btn-ghost" style={{ flex: 1, border: '1px solid var(--background-modifier-border) !important', fontSize: '11px' }} onClick={handleImport}>Import</button>
                            <button className="btn-ghost" style={{ flex: 1, border: '1px solid var(--background-modifier-border) !important', fontSize: '11px' }} onClick={() => setShowExportModal(true)}>Export</button>
                        </div>
                    </div>
                </div>

                {window.innerWidth > 768 && <div className="obsidian-request-sidebar-resizer" onMouseDown={startSidebarResizing}></div>}

                <div className="obsidian-request-main">
                    <div className="obsidian-request-mobile-header">
                        <button onClick={() => setMobileSidebarOpen(!mobileSidebarOpen)}>☰</button>
                        <span style={{ fontWeight: 'bold' }}>API Collection</span>
                    </div>

                    {activeReq?.itemType === 'folder' ? (
                        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)' }}>
                        Select a request to edit.
                        </div>
                    ) : activeReq ? (
                        <RequestEditor
                            request={activeReq}
                            collectionData={collectionData}
                            onChange={(updatedReq: RequestItem) => {
                                const newRequests = collectionData.requests.map(r => r.id === updatedReq.id ? updatedReq : r)
                                handleSave({ ...collectionData, requests: newRequests })
                            }}
                            onExtract={(envId: string, key: string, value: string, isLocal: boolean, localReqId?: string) => {
                                if (isLocal && localReqId) {
                                    const newRequests = collectionData.requests.map(r => {
                                        if (r.id === localReqId) {
                                            const newVars = [...(r.localVariables ?? [])]
                                            const existingVarIndex = newVars.findIndex(v => v.key === key)
                                            if (existingVarIndex >= 0) {
                                                newVars[existingVarIndex] = { ...newVars[existingVarIndex]!, value }
                                            } else {
                                                newVars.push({ key, value, enabled: true })
                                            }
                                            return { ...r, localVariables: newVars }
                                        }
                                        return r
                                    })
                                    handleSave({ ...collectionData, requests: newRequests })
                                } else {
                                    const newEnvs = collectionData.environments.map(e => {
                                        if (e.id === envId) {
                                            const existingVarIndex = e.variables.findIndex(v => v.key === key)
                                            const newVars = [...e.variables]
                                            if (existingVarIndex >= 0) {
                                                newVars[existingVarIndex] = { ...newVars[existingVarIndex]!, value }
                                            } else {
                                                newVars.push({ key, value, enabled: true })
                                            }
                                            return { ...e, variables: newVars }
                                        }
                                        return e
                                    })
                                    handleSave({ ...collectionData, environments: newEnvs })
                                }
                            }}
                        />
                    ) : (
                        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)' }}>
                        Select or create a request.
                        </div>
                    )}
                </div>

                {showEnvManager && (
                    <EnvironmentManager collectionData={collectionData} onSave={handleSave} onClose={() => setShowEnvManager(false)} />
                )}

                {showExportModal && (
                    <div className="obsidian-request-modal-overlay" onClick={() => setShowExportModal(false)}>
                        <div className="obsidian-request-modal" style={{ width: '400px', height: 'auto', padding: '20px' }} onClick={e => e.stopPropagation()}>
                            <h3 style={{ marginTop: 0 }}>Export Collection</h3>
                            <p style={{ color: 'var(--text-muted)', fontSize: '0.9em' }}>Select the format you want to export your collection in:</p>

                            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '20px' }}>
                                <button
                                    style={{ background: 'var(--interactive-accent)', color: 'var(--text-on-accent)', border: 'none', padding: '10px', borderRadius: '4px', cursor: 'pointer' }}
                                    onClick={() => handleExport('external')}
                                >
                                External Collection (v2.1.0)
                                </button>
                                <button
                                    style={{ background: 'var(--background-secondary)', color: 'var(--text-normal)', border: '1px solid var(--background-modifier-border)', padding: '10px', borderRadius: '4px', cursor: 'pointer' }}
                                    onClick={() => handleExport('native')}
                                >
                                Obsidian Native Format
                                </button>
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {contextMenu && (
                <div
                    className="obsidian-request-context-menu"
                    style={{ left: `${contextMenu.x}px`, top: `${contextMenu.y}px` }}
                    onClick={(e) => e.stopPropagation()}
                >
                    <button
                        className="obsidian-request-context-menu-item"
                        onClick={() => { addNewRequest(contextMenu.folderId); setContextMenu(null) }}
                    >
                        Create Request in Folder
                    </button>
                    <button
                        className="obsidian-request-context-menu-item"
                        onClick={() => {
                            setEditingFolderId(contextMenu.folderId)
                            setContextMenu(null)
                        }}
                    >
                        Rename Folder
                    </button>
                    <button
                        className="obsidian-request-context-menu-item"
                        onClick={() => { deleteItem(contextMenu.folderId, { stopPropagation: () => {} } as unknown as React.MouseEvent); setContextMenu(null) }}
                    >
                        Delete Folder
                    </button>
                </div>
            )}
        </>
    )
}

const FolderNameEditor = ({ folder, onSave, onCancel }: { folder: RequestItem, onSave: (name: string) => void, onCancel: () => void }) => {
    const spanRef = React.useRef<HTMLSpanElement>(null)

    React.useEffect(() => {
        const span = spanRef.current
        if (span) {
            span.focus()
            const range = document.createRange()
            range.selectNodeContents(span)
            const sel = window.getSelection()
            if (sel) {
                sel.removeAllRanges()
                sel.addRange(range)
            }
        }
    }, [])

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter') {
            e.preventDefault()
            spanRef.current?.blur()
        } else if (e.key === 'Escape') {
            if (spanRef.current) spanRef.current.textContent = folder.name
            onCancel()
        }
    }

    const handleBlur = () => {
        const newName = spanRef.current?.textContent ?? folder.name
        onSave(newName)
    }

    return (
        <span
            ref={spanRef}
            className="obsidian-request-folder-name"
            contentEditable
            suppressContentEditableWarning
            onClick={(e) => e.stopPropagation()}
            onBlur={handleBlur}
            onKeyDown={handleKeyDown}
        >
            {folder.name}
        </span>
    )
}

const EnvironmentManager = ({ collectionData, onSave, onClose }: { collectionData: CollectionData, onSave: (data: CollectionData) => void, onClose: () => void }) => {
    const [activeEnvId, setActiveEnvId] = React.useState(collectionData.environments[0]?.id)

    const activeEnv = collectionData.environments.find((e: Environment) => e.id === activeEnvId)

    const handleEnvChange = (updatedEnv: Environment) => {
        const newEnvs = collectionData.environments.map((e: Environment) => e.id === updatedEnv.id ? updatedEnv : e)
        onSave({ ...collectionData, environments: newEnvs })
    }

    const addEnv = () => {
        const newEnv: Environment = { id: Date.now().toString(), name: 'New Environment', variables: [] }
        onSave({ ...collectionData, environments: [...collectionData.environments, newEnv] })
        setActiveEnvId(newEnv.id)
    }

    return (
        <div className="obsidian-request-modal-overlay" onClick={onClose}>
            <div className="obsidian-request-modal" onClick={e => e.stopPropagation()}>
                <div style={{ padding: '15px 20px', borderBottom: '1px solid var(--background-modifier-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--background-secondary)' }}>
                    <h3 style={{ margin: 0 }}>Manage Environments</h3>
                    <button className="btn-ghost" onClick={onClose}>✕</button>
                </div>
                <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
                    <div className="env-sidebar" style={{ width: '220px', borderRight: '1px solid var(--background-modifier-border)', display: 'flex', flexDirection: 'column', background: 'var(--background-secondary)' }}>
                        <div style={{ flex: 1, overflowY: 'auto', padding: '10px' }}>
                            {collectionData.environments.map((env: Environment) => (
                                <div key={env.id} onClick={() => setActiveEnvId(env.id)} className={`obsidian-request-request-item ${activeEnvId === env.id ? 'active' : ''}`} style={{ marginBottom: '2px' }}>
                                    <span style={{ fontSize: '14px' }}>{env.name}</span>
                                    <button className="btn-ghost" onClick={(e) => {
                                        e.stopPropagation()
                                        const newEnvs = collectionData.environments.filter((e2: Environment) => e2.id !== env.id)
                                        onSave({ ...collectionData, environments: newEnvs, activeEnvironmentId: collectionData.activeEnvironmentId === env.id ? null : collectionData.activeEnvironmentId })
                                    }}>×</button>
                                </div>
                            ))}
                        </div>
                        <div style={{ padding: '10px', borderTop: '1px solid var(--background-modifier-border)' }}>
                            <button style={{ width: '100%', background: 'transparent', border: '1px dashed var(--background-modifier-border)', padding: '6px', borderRadius: '4px', color: 'var(--text-muted)', cursor: 'pointer' }} onClick={addEnv}>+ Add Environment</button>
                        </div>
                    </div>
                    <div style={{ flex: 1, padding: '20px', overflowY: 'auto' }}>
                        {activeEnv ? (
                            <div>
                                <div style={{ marginBottom: '20px' }}>
                                    <label style={{ display: 'block', fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '5px' }}>Environment Name</label>
                                    <input
                                        style={{ fontSize: '16px', fontWeight: 'bold', width: '100%', background: 'var(--background-primary)', border: '1px solid var(--background-modifier-border)', padding: '8px', borderRadius: '4px' }}
                                        value={activeEnv.name}
                                        onChange={(e) => handleEnvChange({ ...activeEnv, name: e.target.value })}
                                    />
                                </div>

                                <label style={{ display: 'block', fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '10px' }}>Variables</label>
                                {activeEnv.variables.map((v: Variable, i: number) => (
                                    <div key={i} className="obsidian-request-kv-row">
                                        <input type="checkbox" checked={v.enabled} onChange={(e) => {
                                            const newVars = [...activeEnv.variables]; newVars[i]!.enabled = e.target.checked; handleEnvChange({ ...activeEnv, variables: newVars })
                                        }}/>
                                        <input className="obsidian-request-kv-input" style={{ flex: 1 }} placeholder="Variable key" value={v.key} onChange={(e) => {
                                            const newVars = [...activeEnv.variables]; newVars[i]!.key = e.target.value; handleEnvChange({ ...activeEnv, variables: newVars })
                                        }}/>
                                        <input className="obsidian-request-kv-input" style={{ flex: 2 }} placeholder="Initial value" value={v.value} onChange={(e) => {
                                            const newVars = [...activeEnv.variables]; newVars[i]!.value = e.target.value; handleEnvChange({ ...activeEnv, variables: newVars })
                                        }}/>
                                        <button className="btn-ghost" onClick={() => {
                                            const newVars = [...activeEnv.variables]; newVars.splice(i, 1); handleEnvChange({ ...activeEnv, variables: newVars })
                                        }}>×</button>
                                    </div>
                                ))}
                                <button className="btn-ghost" style={{ marginTop: '10px', border: '1px solid var(--background-modifier-border) !important' }} onClick={() => handleEnvChange({ ...activeEnv, variables: [...activeEnv.variables, { key: '', value: '', enabled: true }] })}>
                                    + Add Variable
                                </button>
                            </div>
                        ) : (
                            <div style={{ color: 'var(--text-muted)', textAlign: 'center', marginTop: '50px' }}>Select an environment to edit</div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    )
}

const HighlightedInput = ({ value, onChange, className, style, placeholder, collectionData }: { value: string, onChange: (val: string) => void, className?: string, style?: React.CSSProperties, placeholder?: string, collectionData: CollectionData }) => {
    const [isEditing, setIsEditing] = React.useState(false)
    const inputRef = React.useRef<HTMLInputElement>(null)

    React.useEffect(() => {
        if (isEditing && inputRef.current) {
            inputRef.current.focus()
        }
    }, [isEditing])

    const activeEnv = collectionData.environments.find((e: Environment) => e.id === collectionData.activeEnvironmentId)

    const getVariableValue = (varName: string) => {
        if (!activeEnv) return 'No active environment'
        const variable = activeEnv.variables.find((v: Variable) => v.key === varName && v.enabled)
        return variable ? variable.value : 'Unresolved variable'
    }

    const renderHighlightedText = () => {
        if (!value) return <span style={{ color: 'var(--text-faint)' }}>{placeholder}</span>

        const regex = /({{.*?}})/g
        const parts = value.split(regex)

        return parts.map((part: string, i: number) => {
            if (part.startsWith('{{') && part.endsWith('}}')) {
                const varName = part.substring(2, part.length - 2)
                return (
                    <span key={i} className="obsidian-request-var-highlight" title={getVariableValue(varName)}>
                        {part}
                    </span>
                )
            }
            return <span key={i}>{part}</span>
        })
    }

    if (isEditing) {
        return (
            <input
                ref={inputRef}
                className={className}
                style={style}
                value={value}
                onChange={(e) => onChange(e.target.value)}
                onBlur={() => setIsEditing(false)}
                placeholder={placeholder}
                onKeyDown={(e) => {
                    if (e.key === 'Enter') setIsEditing(false)
                }}
            />
        )
    }

    return (
        <div
            className={`obsidian-request-highlighted-input-container ${className ?? ''}`}
            style={style}
            onClick={() => setIsEditing(true)}
        >
            <div className="obsidian-request-highlighted-input-display">
                {renderHighlightedText()}
            </div>
        </div>
    )
}

const RawBodyEditor = ({ value, onChange }: { value: string, onChange: (val: string) => void }) => {
    const textareaRef = React.useRef<HTMLTextAreaElement>(null)
    const highlightRef = React.useRef<HTMLPreElement>(null)

    const handleScroll = () => {
        if (textareaRef.current && highlightRef.current) {
            highlightRef.current.scrollTop = textareaRef.current.scrollTop
            highlightRef.current.scrollLeft = textareaRef.current.scrollLeft
        }
    }

    const highlighted = React.useMemo(() => {
        if (!value) return ''
        try {
            return highlightJsonText(value)
        } catch {
            return value
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
        }
    }, [value])

    const sharedStyle: React.CSSProperties = {
        fontFamily: 'var(--font-monospace)',
        fontSize: 'inherit',
        lineHeight: 'inherit',
        padding: '10px',
        border: '1px solid var(--background-modifier-border)',
        borderRadius: '4px',
        whiteSpace: 'pre-wrap',
        wordBreak: 'break-all',
        overflow: 'auto'
    }

    return (
        <div style={{ position: 'relative', flex: 1, minHeight: '150px' }}>
            <pre
                ref={highlightRef}
                aria-hidden="true"
                style={{
                    ...sharedStyle,
                    position: 'absolute',
                    inset: 0,
                    margin: 0,
                    background: 'transparent',
                    color: 'var(--text-normal)',
                    pointerEvents: 'none'
                }}
                dangerouslySetInnerHTML={{
                    __html: highlighted
                        ? highlighted
                        : '<span style="color: var(--text-faint)">{\n  "key": "value"\n}</span>'
                }}
            />
            <textarea
                ref={textareaRef}
                style={{
                    ...sharedStyle,
                    position: 'relative',
                    width: '100%',
                    minHeight: '150px',
                    resize: 'vertical',
                    background: 'transparent',
                    color: 'transparent',
                    caretColor: 'var(--text-normal)'
                }}
                value={value}
                onChange={(e) => onChange(e.target.value)}
                onScroll={handleScroll}
                placeholder={'{\n  "key": "value"\n}'}
            />
        </div>
    )
}

const RequestEditor = ({ request, collectionData, onChange, onExtract }: { request: RequestItem, collectionData: CollectionData, onChange: (req: RequestItem) => void, onExtract: (envId: string, key: string, value: string, isLocal: boolean, localReqId?: string) => void }) => {
    const [activeTab, setActiveTab] = React.useState('Params')
    const [response, setResponse] = React.useState<{ response?: { status: number | undefined, text: string, contentType?: string, headers: Record<string, string | string[] | undefined>, isBinary?: boolean, arrayBuffer?: ArrayBuffer }, error?: string, timeMs?: number, logs?: PreRequestLog[] } | null>(null)
    const [loading, setLoading] = React.useState(false)
    const [loadingStatus, setLoadingStatus] = React.useState<string>('')
    const [responseMode, setResponseMode] = React.useState<'raw' | 'preview'>('raw')
    const [responseHeight, setResponseHeight] = React.useState(35)
    const [responseSubTab, setResponseSubTab] = React.useState<'Body' | 'Headers' | 'Cookies' | 'Pre-req Logs'>('Body')

    const [localName, setLocalName] = React.useState(request.name)
    const tabsRef = React.useRef<HTMLDivElement>(null)

    React.useEffect(() => {
        setLocalName(request.name)
    }, [request.id, request.name])

    const startResizing = React.useCallback((e: React.MouseEvent<HTMLDivElement>) => {
        e.preventDefault()
        const startY = e.clientY
        const startHeight = responseHeight
        const containerHeight = (document.querySelector('.obsidian-request-main') as HTMLElement | null)?.clientHeight ?? 1000

        const doDrag = (dragEvent: MouseEvent) => {
            const deltaY = startY - dragEvent.clientY
            const deltaPercent = (deltaY / containerHeight) * 100
            setResponseHeight(Math.min(Math.max(startHeight + deltaPercent, 10), 85))
        }

        const stopDrag = () => {
            document.removeEventListener('mousemove', doDrag)
            document.removeEventListener('mouseup', stopDrag)
        }

        document.addEventListener('mousemove', doDrag)
        document.addEventListener('mouseup', stopDrag)
    }, [responseHeight])

    const handleSend = async () => {
        setLoading(true)
        setLoadingStatus('')
        setResponse(null)
        try {
            const res = await executeWithDependencies(request.id, collectionData, onExtract, (status) => setLoadingStatus(status))
            setResponse(res as typeof response)
        } catch (e: unknown) {
            setResponse({ error: e instanceof Error ? e.message : String(e) })
        }
        setLoading(false)
        setLoadingStatus('')
    }

    const updateVariableList = (listKey: 'queryParams' | 'headers' | 'bodyFormUrlEncoded', index: number, field: string, value: string | boolean) => {
        const newList = [...request[listKey]]
        newList[index] = { ...newList[index]!, [field]: value }

        const updatedReq = { ...request, [listKey]: newList }

        if (listKey === 'queryParams') {
            try {
                const baseUrl = updatedReq.url.split('?')[0] ?? ''
                const activeParams = newList.filter((p: Variable) => p.enabled && p.key)
                if (activeParams.length > 0) {
                    const qs = activeParams.map((p: Variable) => `${encodeURIComponent(p.key)}=${encodeURIComponent(p.value)}`).join('&')
                    updatedReq.url = `${baseUrl}?${qs}`
                } else {
                    updatedReq.url = baseUrl
                }
            } catch { /* empty */ }
        }

        onChange(updatedReq)
    }

    const handleUrlChange = (newUrl: string) => {
        const updatedReq = { ...request, url: newUrl }
        try {
            const parts = newUrl.split('?')
            if (parts.length > 1) {
                const qs = parts[1] ?? ''
                const pairs = qs.split('&')
                const newParams: Variable[] = pairs.map(pair => {
                    const [k, v] = pair.split('=')
                    return { key: decodeURIComponent(k ?? ''), value: decodeURIComponent(v ?? ''), enabled: true }
                }).filter(p => p.key)
                updatedReq.queryParams = newParams
            } else {
                updatedReq.queryParams = []
            }
        } catch { /* empty */ }
        onChange(updatedReq)
    }

    const [showHiddenHeaders, setShowHiddenHeaders] = React.useState(false)

    const renderVariableList = (listKey: 'queryParams' | 'headers' | 'bodyFormUrlEncoded') => {
        const items = request[listKey] ?? []
        const normalItems = listKey === 'headers' ? items.filter((i: Variable) => !i.auto) : items
        const autoItems = listKey === 'headers' ? items.filter((i: Variable) => i.auto) : []

        return (
            <div>
                {normalItems.map((item: Variable, _: number) => {
                    const actualIndex = items.findIndex((orig: Variable) => orig === item)
                    return (
                        <div key={actualIndex} className="obsidian-request-kv-row">
                            <input type="checkbox" checked={item.enabled} onChange={(e) => updateVariableList(listKey, actualIndex, 'enabled', e.target.checked)} />
                            <HighlightedInput
                                className="obsidian-request-kv-input" style={{ flex: 1 }}
                                placeholder="Key" value={item.key}
                                onChange={(val: string) => updateVariableList(listKey, actualIndex, 'key', val)}
                                collectionData={collectionData}
                            />
                            <HighlightedInput
                                className="obsidian-request-kv-input" style={{ flex: 2 }}
                                placeholder="Value" value={item.value}
                                onChange={(val: string) => updateVariableList(listKey, actualIndex, 'value', val)}
                                collectionData={collectionData}
                            />
                            <button className="btn-ghost" onClick={() => {
                                const newList = [...request[listKey]]; newList.splice(actualIndex, 1); onChange({ ...request, [listKey]: newList })
                            }}>×</button>
                        </div>
                    )
                })}
                <button className="btn-ghost" style={{ marginTop: '10px', border: '1px solid var(--background-modifier-border) !important' }} onClick={() => onChange({ ...request, [listKey]: [...request[listKey], { key: '', value: '', enabled: true }] })}>
                    + Add
                </button>

                {listKey === 'headers' && autoItems.length > 0 && (
                    <div style={{ marginTop: '20px', borderTop: '1px dashed var(--background-modifier-border)', paddingTop: '10px' }}>
                        <button className="btn-ghost" style={{ fontSize: '11px', padding: 0, color: 'var(--text-muted)' }} onClick={() => setShowHiddenHeaders(!showHiddenHeaders)}>
                            {showHiddenHeaders ? '▼ Hide' : '▶ Show'} auto-generated headers
                        </button>
                        {showHiddenHeaders && (
                            <div style={{ marginTop: '10px', opacity: 0.8 }}>
                                {autoItems.map((item: Variable, _: number) => {
                                    const actualIndex = items.findIndex((orig: Variable) => orig === item)
                                    return (
                                        <div key={actualIndex} className="obsidian-request-kv-row">
                                            <input type="checkbox" checked={item.enabled} onChange={(e) => updateVariableList(listKey, actualIndex, 'enabled', e.target.checked)} />
                                            <input className="obsidian-request-kv-input" style={{ flex: 1 }} value={item.key} onChange={(e) => updateVariableList(listKey, actualIndex, 'key', e.target.value)} disabled />
                                            <HighlightedInput
                                                className="obsidian-request-kv-input" style={{ flex: 2 }}
                                                placeholder="Value" value={item.value}
                                                onChange={(val: string) => updateVariableList(listKey, actualIndex, 'value', val)}
                                                collectionData={collectionData}
                                            />
                                        </div>
                                    )
                                })}
                            </div>
                        )}
                    </div>
                )}
            </div>
        )
    }

    return (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden', minWidth: 0 }}>
            <div className="obsidian-request-editor-header">
                <input
                    className="obsidian-request-request-title-input"
                    value={localName}
                    onChange={(e) => setLocalName(e.target.value)}
                    onBlur={() => { if (localName !== request.name) onChange({ ...request, name: localName }) }}
                    onKeyDown={(e) => { if(e.key === 'Enter') { e.currentTarget.blur() } }}
                    placeholder="Request Name"
                />

                <div className="obsidian-request-url-bar">
                    <select value={request.method} onChange={(e) => onChange({ ...request, method: e.target.value as RequestItem['method'] })}>
                        <option value="GET">GET</option>
                        <option value="POST">POST</option>
                        <option value="PUT">PUT</option>
                        <option value="PATCH">PATCH</option>
                        <option value="DELETE">DELETE</option>
                        <option value="OPTIONS">OPTIONS</option>
                        <option value="HEAD">HEAD</option>
                    </select>
                    <HighlightedInput
                        value={request.url}
                        onChange={handleUrlChange}
                        placeholder="Enter request URL"
                        collectionData={collectionData}
                    />
                    <button onClick={handleSend} disabled={loading}>
                        {loading ? <span className="loading-spinner"></span> : 'Send'}
                    </button>
                </div>
            </div>

            <div
                className="obsidian-request-tabs-header"
                ref={tabsRef}
                onWheel={(e) => {
                    if (tabsRef.current) {
                        e.preventDefault()
                        tabsRef.current.scrollLeft += e.deltaY
                    }
                }}
            >
                {['Params', 'Auth', 'Headers', 'Body', 'Variables', 'Pre-req', 'Extract', 'Settings'].map(tab => {
                    let hasData = false
                    if (tab === 'Params') hasData = (request.queryParams ?? []).some((p: Variable) => p.key || p.value)
                    if (tab === 'Headers') hasData = (request.headers ?? []).some((p: Variable) => p.key || p.value)
                    if (tab === 'Auth') hasData = request.auth?.type !== 'none'
                    if (tab === 'Body') hasData = request.bodyType !== 'none'
                    if (tab === 'Variables') hasData = (request.localVariables ?? []).length > 0
                    if (tab === 'Pre-req') hasData = (request.dependencies ?? []).length > 0
                    if (tab === 'Extract') hasData = (request.extractionRules ?? []).length > 0

                    return (
                        <div key={tab} className={`obsidian-request-tab ${activeTab === tab ? 'active' : ''}`} onClick={() => setActiveTab(tab)} style={{ position: 'relative' }}>
                            {tab}
                            {hasData && <span style={{ position: 'absolute', top: '8px', right: '-2px', width: '6px', height: '6px', backgroundColor: 'var(--interactive-accent)', borderRadius: '50%' }}></span>}
                        </div>
                    )
                })}
            </div>

            <div className="obsidian-request-tab-content">
                {activeTab === 'Params' && renderVariableList('queryParams')}
                {activeTab === 'Headers' && renderVariableList('headers')}
                {activeTab === 'Variables' && (
                    <div style={{ color: 'var(--text-muted)', fontStyle: 'italic', fontSize: '0.9em', padding: '20px' }}>
                        Local variables are set via pre-request dependencies or the Extract tab.
                    </div>
                )}
                {activeTab === 'Auth' && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                            <label style={{ fontWeight: 'bold' }}>Auth Type:</label>
                            <select
                                className="obsidian-request-kv-input"
                                value={request.auth?.type ?? 'none'}
                                onChange={(e) => onChange({ ...request, auth: { ...request.auth, type: e.target.value as AuthConfig['type'] } })}
                            >
                                <option value="none">No Auth</option>
                                <option value="basic">Basic Auth</option>
                                <option value="bearer">Bearer Token</option>
                                <option value="apikey">API Key</option>
                            </select>
                        </div>
                        {request.auth?.type === 'basic' && (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', maxWidth: '400px' }}>
                                <HighlightedInput className="obsidian-request-kv-input" placeholder="Username (e.g. {{username}})" value={request.auth?.basicUsername ?? ''} onChange={(val: string) => onChange({ ...request, auth: { ...request.auth, basicUsername: val } })} collectionData={collectionData} />
                                <HighlightedInput className="obsidian-request-kv-input" placeholder="Password (e.g. {{password}})" value={request.auth?.basicPassword ?? ''} onChange={(val: string) => onChange({ ...request, auth: { ...request.auth, basicPassword: val } })} collectionData={collectionData} />
                            </div>
                        )}
                        {request.auth?.type === 'bearer' && (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', maxWidth: '400px' }}>
                                <HighlightedInput className="obsidian-request-kv-input" placeholder="Token (e.g. {{bearerToken}})" value={request.auth?.bearerToken ?? ''} onChange={(val: string) => onChange({ ...request, auth: { ...request.auth, bearerToken: val } })} collectionData={collectionData} />
                            </div>
                        )}
                        {request.auth?.type === 'apikey' && (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', maxWidth: '400px' }}>
                                <HighlightedInput className="obsidian-request-kv-input" placeholder="Key" value={request.auth?.apiKeyKey ?? ''} onChange={(val: string) => onChange({ ...request, auth: { ...request.auth, apiKeyKey: val } })} collectionData={collectionData} />
                                <HighlightedInput className="obsidian-request-kv-input" placeholder="Value (e.g. {{apiKey}})" value={request.auth?.apiKeyValue ?? ''} onChange={(val: string) => onChange({ ...request, auth: { ...request.auth, apiKeyValue: val } })} collectionData={collectionData} />
                                <select className="obsidian-request-kv-input" value={request.auth?.apiKeyAddTo ?? 'header'} onChange={(e) => onChange({ ...request, auth: { ...request.auth, apiKeyAddTo: e.target.value as AuthConfig['apiKeyAddTo'] } })}>
                                    <option value="header">Add to Header</option>
                                    <option value="query">Add to Query Params</option>
                                </select>
                            </div>
                        )}
                    </div>
                )}
                {activeTab === 'Settings' && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                        <label style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                            <input type="checkbox" checked={request.settings?.followRedirects ?? true} onChange={(e) => onChange({ ...request, settings: { ...request.settings, followRedirects: e.target.checked } })} />
                            Follow Redirects
                        </label>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                            <label>Max Redirects:</label>
                            <input type="number" className="obsidian-request-kv-input" style={{ width: '80px' }} value={request.settings?.maxRedirects ?? 5} onChange={(e) => onChange({ ...request, settings: { ...request.settings, maxRedirects: parseInt(e.target.value) || 5 } })} />
                        </div>
                        <label style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                            <input type="checkbox" checked={request.settings?.verifySsl ?? true} onChange={(e) => onChange({ ...request, settings: { ...request.settings, verifySsl: e.target.checked } })} />
                            Verify SSL Certificates
                        </label>
                    </div>
                )}
                {activeTab === 'Body' && (
                    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
                        <div style={{ marginBottom: '15px', display: 'flex', gap: '15px', fontSize: '0.9em', flexWrap: 'wrap', alignItems: 'center' }}>
                            <label style={{ display: 'flex', alignItems: 'center', gap: '5px' }}><input type="radio" checked={request.bodyType === 'none'} onChange={() => onChange({ ...request, bodyType: 'none' })} /> none</label>
                            <label style={{ display: 'flex', alignItems: 'center', gap: '5px' }}><input type="radio" checked={request.bodyType === 'json'} onChange={() => onChange({ ...request, bodyType: 'json' })} /> raw (JSON)</label>
                            <label style={{ display: 'flex', alignItems: 'center', gap: '5px' }}><input type="radio" checked={request.bodyType === 'form-data'} onChange={() => onChange({ ...request, bodyType: 'form-data' })} /> form-data</label>
                            <label style={{ display: 'flex', alignItems: 'center', gap: '5px' }}><input type="radio" checked={request.bodyType === 'x-www-form-urlencoded'} onChange={() => onChange({ ...request, bodyType: 'x-www-form-urlencoded' })} /> x-www-form-urlencoded</label>
                            <label style={{ display: 'flex', alignItems: 'center', gap: '5px' }}><input type="radio" checked={request.bodyType === 'binary'} onChange={() => onChange({ ...request, bodyType: 'binary' })} /> binary</label>
                            {request.bodyType === 'json' && (
                                <button className="btn-ghost" style={{ marginLeft: 'auto', fontSize: '11px', border: '1px solid var(--background-modifier-border) !important' }} onClick={() => {
                                    try {
                                        const parsed = JSON.parse(request.bodyRaw)
                                        onChange({ ...request, bodyRaw: JSON.stringify(parsed, null, 2) })
                                    } catch {
                                        if (request.bodyRaw.trim().startsWith('<')) {
                                            let formatted = ''
                                            let pad = 0
                                            request.bodyRaw.split(/(?=(?:<[^>]+>))/).forEach((node: string) => {
                                                if (node.match(/^<\w[^>]*[^/]>.*$/)) {
                                                    formatted += `${'  '.repeat(pad)}${node}\n`
                                                    pad += 1
                                                } else if (node.match(/^<\/\w/)) {
                                                    if (pad !== 0) pad -= 1
                                                    formatted += `${'  '.repeat(pad)}${node}\n`
                                                } else {
                                                    formatted += `${'  '.repeat(pad)}${node}\n`
                                                }
                                            })
                                            onChange({ ...request, bodyRaw: formatted.trim() })
                                        } else {
                                            new Notice('Cannot prettify: Invalid JSON or XML')
                                        }
                                    }
                                }}>Prettify</button>
                            )}
                        </div>
                        {request.bodyType === 'json' && (
                            <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                                <RawBodyEditor
                                    value={request.bodyRaw}
                                    onChange={(val: string) => onChange({ ...request, bodyRaw: val })}
                                />
                            </div>
                        )}
                        {request.bodyType === 'form-data' && (
                            <div>
                                {request.bodyFormData.map((fd: { key: string; value: string; type: 'text' | 'file'; enabled: boolean }, i: number) => (
                                    <div key={i} className="obsidian-request-kv-row">
                                        <input type="checkbox" checked={fd.enabled} onChange={(e) => {
                                            const newFd = [...request.bodyFormData]; newFd[i]!.enabled = e.target.checked; onChange({ ...request, bodyFormData: newFd })
                                        }} />
                                        <select className="obsidian-request-kv-input" value={fd.type} onChange={(e) => {
                                            const newFd = [...request.bodyFormData]; newFd[i]!.type = e.target.value as 'text' | 'file'; onChange({ ...request, bodyFormData: newFd })
                                        }}>
                                            <option value="text">Text</option>
                                            <option value="file">File</option>
                                        </select>
                                        <input className="obsidian-request-kv-input" style={{ flex: 1 }} placeholder="Key" value={fd.key} onChange={(e) => {
                                            const newFd = [...request.bodyFormData]; newFd[i]!.key = e.target.value; onChange({ ...request, bodyFormData: newFd })
                                        }} />
                                        {fd.type === 'file' ? (
                                            <input className="obsidian-request-kv-input" style={{ flex: 2, padding: '4px' }} type="file" onChange={(e) => {
                                                const file = e.target.files?.[0]
                                                if (file) {
                                                    const newFd = [...request.bodyFormData]; newFd[i]!.value = (file as File & { path: string }).path; onChange({ ...request, bodyFormData: newFd })
                                                }
                                            }} />
                                        ) : (
                                            <input className="obsidian-request-kv-input" style={{ flex: 2 }} placeholder="Value" value={fd.value} onChange={(e) => {
                                                const newFd = [...request.bodyFormData]; newFd[i]!.value = e.target.value; onChange({ ...request, bodyFormData: newFd })
                                            }} />
                                        )}
                                        <button className="btn-ghost" onClick={() => {
                                            const newFd = [...request.bodyFormData]; newFd.splice(i, 1); onChange({ ...request, bodyFormData: newFd })
                                        }}>×</button>
                                    </div>
                                ))}
                                <button className="btn-ghost" style={{ marginTop: '10px', border: '1px solid var(--background-modifier-border) !important' }} onClick={() => onChange({ ...request, bodyFormData: [...request.bodyFormData, { key: '', value: '', type: 'text', enabled: true }] })}>
                                    + Add Item
                                </button>
                            </div>
                        )}
                        {request.bodyType === 'x-www-form-urlencoded' && renderVariableList('bodyFormUrlEncoded')}
                        {request.bodyType === 'binary' && (
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '20px', border: '1px dashed var(--background-modifier-border)', borderRadius: '4px' }}>
                                <input type="file" onChange={(e) => {
                                    const file = e.target.files?.[0]
                                    if (file) {
                                        onChange({ ...request, bodyBinaryPath: (file as File & { path: string }).path })
                                    }
                                }} />
                                <span style={{ color: 'var(--text-muted)' }}>{request.bodyBinaryPath || 'No file selected'}</span>
                            </div>
                        )}
                    </div>
                )}
                {activeTab === 'Extract' && (
                    <div>
                        <p style={{ fontSize: '0.9em', color: 'var(--text-muted)', marginBottom: '15px' }}>Extract values from JSON responses using <a href="https://github.com/JSONPath-Plus/JSONPath" target="_blank" rel="noopener noreferrer">JSONPath</a> to save them into your active environment.</p>
                        {request.extractionRules.map((rule: ExtractionRule, i: number) => (
                            <div key={i} className="obsidian-request-kv-row">
                                <input className="obsidian-request-kv-input" style={{ flex: 1 }} placeholder="Variable Name (e.g., token)" value={rule.name} onChange={(e) => {
                                    const newRules = [...request.extractionRules]; newRules[i]!.name = e.target.value; onChange({ ...request, extractionRules: newRules })
                                }} />
                                <input className="obsidian-request-kv-input" style={{ flex: 2 }} placeholder="JSONPath (e.g., $.data.token)" value={rule.jsonPath} onChange={(e) => {
                                    const newRules = [...request.extractionRules]; newRules[i]!.jsonPath = e.target.value; onChange({ ...request, extractionRules: newRules })
                                }} />
                                <button className="btn-ghost" onClick={() => {
                                    const newRules = [...request.extractionRules]; newRules.splice(i, 1); onChange({ ...request, extractionRules: newRules })
                                }}>×</button>
                            </div>
                        ))}
                        <button className="btn-ghost" style={{ marginTop: '10px', border: '1px solid var(--background-modifier-border) !important' }} onClick={() => onChange({ ...request, extractionRules: [...request.extractionRules, { id: Date.now().toString(), name: '', jsonPath: '$' }] })}>
                            + Add Rule
                        </button>
                    </div>
                )}
                {activeTab === 'Pre-req' && (
                    <PreRequestsTab request={request} collectionData={collectionData} onChange={onChange} />
                )}
            </div>

            <div className="obsidian-request-resizer" onMouseDown={startResizing} title="Drag to resize response view"></div>

            <div className="obsidian-request-response-area" style={{ height: `${responseHeight}%` }}>
                <div className="obsidian-request-response-header">
                    <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                        <div style={{ display: 'flex', gap: '10px', fontWeight: 600 }}>
                            {['Body', 'Headers', 'Cookies', 'Pre-req Logs'].map(subTab => (
                                <span
                                    key={subTab}
                                    style={{
                                        cursor: 'pointer',
                                        color: responseSubTab === subTab ? 'var(--text-normal)' : 'var(--text-muted)',
                                        borderBottom: responseSubTab === subTab ? '2px solid var(--interactive-accent)' : 'none'
                                    }}
                                    onClick={() => setResponseSubTab(subTab as 'Body' | 'Headers' | 'Cookies' | 'Pre-req Logs')}
                                >
                                    {subTab}
                                </span>
                            ))}
                        </div>
                        {response?.response && responseSubTab === 'Body' && (
                            <div style={{ display: 'flex', gap: '5px' }}>
                                <button className={`btn-ghost ${responseMode === 'raw' ? 'active' : ''}`} style={{ fontSize: '10px', background: responseMode === 'raw' ? 'var(--background-modifier-active-hover)' : 'transparent' }} onClick={() => setResponseMode('raw')}>Raw</button>
                                <button className={`btn-ghost ${responseMode === 'preview' ? 'active' : ''}`} style={{ fontSize: '10px', background: responseMode === 'preview' ? 'var(--background-modifier-active-hover)' : 'transparent' }} onClick={() => setResponseMode('preview')}>Preview</button>
                            </div>
                        )}
                    </div>
                    {response?.response && (
                        <div className="obsidian-request-response-status">
                            <span>Status: <span className={`obsidian-request-badge ${(response.response.status ?? 0) >= 200 && (response.response.status ?? 0) < 300 ? 'success' : 'error'}`}>{response.response.status ?? 'N/A'}</span></span>
                            <span style={{ color: 'var(--text-muted)' }}>Time: {response.timeMs} ms</span>
                        </div>
                    )}
                </div>
                <div className="obsidian-request-response-body" style={{ padding: responseMode === 'preview' && responseSubTab === 'Body' ? '0' : '15px 20px' }}>
                    {loading && <div style={{ color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '8px', padding: '15px 20px' }}><span className="loading-spinner"></span> {loadingStatus || 'Waiting for response...'}</div>}
                    {!loading && !response && <div style={{ color: 'var(--text-muted)', fontStyle: 'italic', textAlign: 'center', marginTop: '20px' }}>Enter the URL and click Send to get a response</div>}
                    {!loading && response?.error && <div style={{ color: 'var(--color-red)', padding: '15px 20px' }}>Error: {response.error}</div>}
                    {!loading && response && (
                        <>
                            {response.response && responseSubTab === 'Body' && responseMode === 'raw' && (
                                <pre>
                                    {(() => {
                                        if (response.response.isBinary) {
                                            return `<Binary data: ${response.response.contentType}>`
                                        }
                                        const formatted = formatAndHighlightResponseBody(response.response.text, response.response.contentType)
                                        if (formatted.isHtml) {
                                            return <code dangerouslySetInnerHTML={{ __html: formatted.content }} />
                                        }
                                        return formatted.content
                                    })()}
                                </pre>
                            )}
                            {response.response && responseSubTab === 'Body' && responseMode === 'preview' && (
                                <div style={{ width: '100%', height: '100%', background: 'white' }}>
                                    {response.response.contentType?.includes('image') ? (
                                        <img
                                            src={URL.createObjectURL(new Blob([response.response.arrayBuffer ?? new ArrayBuffer(0)], { type: response.response.contentType }))}
                                            style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }}
                                        />
                                    ) : (
                                        <iframe
                                            srcDoc={response.response.text}
                                            style={{ width: '100%', height: '100%', border: 'none', background: 'white' }}
                                            sandbox="allow-scripts"
                                        />
                                    )}
                                </div>
                            )}

                            {response.response && responseSubTab === 'Headers' && (
                                <div>
                                    {Object.entries(response.response.headers ?? {}).map(([key, val]: [string, string | string[] | undefined], i) => (
                                        <div key={i} className="obsidian-request-kv-row">
                                            <input className="obsidian-request-kv-input" style={{ flex: 1, fontWeight: 'bold' }} readOnly value={key} />
                                            <input className="obsidian-request-kv-input" style={{ flex: 2 }} readOnly value={Array.isArray(val) ? val.join(', ') : (val ?? '')} />
                                        </div>
                                    ))}
                                </div>
                            )}

                            {response.response && responseSubTab === 'Cookies' && (
                                <div>
                                    {(() => {
                                        const cookies: string[] = Array.isArray(response.response.headers['set-cookie'])
                                            ? response.response.headers['set-cookie']
                                            : response.response.headers['set-cookie'] ? [response.response.headers['set-cookie']] : []

                                        if (cookies.length === 0) return <div style={{ color: 'var(--text-muted)' }}>No cookies returned.</div>

                                        return cookies.map((cookieStr: string, i: number) => {
                                            const parts = cookieStr.split(';')
                                            const [nameVal] = parts
                                            const [name, val] = (nameVal ?? '').split('=')
                                            return (
                                                <div key={i} className="obsidian-request-kv-row" style={{ marginBottom: '10px' }}>
                                                    <input className="obsidian-request-kv-input" style={{ flex: 1, fontWeight: 'bold' }} readOnly value={name} />
                                                    <input className="obsidian-request-kv-input" style={{ flex: 2 }} readOnly value={val ?? ''} />
                                                </div>
                                            )
                                        })
                                    })()}
                                </div>
                            )}

                            {responseSubTab === 'Pre-req Logs' && (
                                <div>
                                    {response.logs && response.logs.length > 0 ? (
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                            {response.logs.map((log: PreRequestLog, i: number) => (
                                                <details key={i} style={{ border: '1px solid var(--background-modifier-border)', borderRadius: '4px', overflow: 'hidden' }}>
                                                    <summary style={{ background: 'var(--background-secondary)', padding: '4px 8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer', outline: 'none' }}>
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                            <span className={`obsidian-request-badge ${log.status >= 200 && log.status < 300 ? 'success' : 'error'}`} style={{ fontSize: '9px', padding: '1px 4px' }}>{log.status ?? 'ERR'}</span>
                                                            <span style={{ fontWeight: '600', fontSize: '12px' }}>{log.requestName}</span>
                                                        </div>
                                                        <div style={{ display: 'flex', gap: '10px', alignItems: 'center', fontSize: '11px' }}>
                                                            <span style={{ color: 'var(--color-orange)' }}>{log.extractedVariables.length > 0 ? `+${log.extractedVariables.length} vars` : ''}</span>
                                                            <span style={{ color: 'var(--text-muted)' }}>{log.timeMs}ms</span>
                                                        </div>
                                                    </summary>
                                                    <div style={{ padding: '8px', fontSize: '11px', borderTop: '1px solid var(--background-modifier-border)' }}>
                                                        {log.error ? (
                                                            <div style={{ color: 'var(--color-red)' }}>{log.error}</div>
                                                        ) : (
                                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                                                {log.extractedVariables.length > 0 && (
                                                                    <div>
                                                                        <span style={{ color: 'var(--text-muted)', textTransform: 'uppercase', fontSize: '10px' }}>Extracted</span>
                                                                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '4px' }}>
                                                                            {log.extractedVariables.map((v: { key: string; value: string }, j: number) => (
                                                                                <span key={j} style={{ background: 'var(--background-primary-alt)', padding: '2px 4px', borderRadius: '3px', border: '1px solid var(--background-modifier-border-hover)' }}>
                                                                                    <span style={{ color: 'var(--color-orange)', marginRight: '4px' }}>{v.key}:</span>
                                                                                    <span style={{ color: 'var(--text-normal)' }}>{v.value}</span>
                                                                                </span>
                                                                            ))}
                                                                        </div>
                                                                    </div>
                                                                )}
                                                                <div>
                                                                    <span style={{ color: 'var(--text-muted)', textTransform: 'uppercase', fontSize: '10px' }}>Body</span>
                                                                    <pre style={{ marginTop: '4px', maxHeight: '120px', overflowY: 'auto', background: 'var(--background-primary-alt)', padding: '6px', borderRadius: '4px' }}>
                                                                        {(() => {
                                                                            const formatted = formatAndHighlightResponseBody(log.responseBody, '')
                                                                            if (formatted.isHtml) {
                                                                                return <code dangerouslySetInnerHTML={{ __html: formatted.content }} />
                                                                            }
                                                                            return formatted.content
                                                                        })()}
                                                                    </pre>
                                                                </div>
                                                            </div>
                                                        )}
                                                    </div>
                                                </details>
                                            ))}
                                        </div>
                                    ) : (
                                        <div style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>No dependency logs.</div>
                                    )}
                                </div>
                            )}
                        </>
                    )}
                </div>
            </div>
        </div>
    )
}
