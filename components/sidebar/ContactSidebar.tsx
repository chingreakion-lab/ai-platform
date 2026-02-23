"use client"
import { useState } from 'react'
import { useAppStore } from '@/lib/store'
import { Search, Users, User, Plus, ChevronDown, ChevronRight } from 'lucide-react'

function cn(...classes: (string | boolean | undefined)[]) {
  return classes.filter(Boolean).join(' ')
}

export function ContactSidebar() {
  const {
    friends, groups, conversations,
    activeConversationId, activeGroupId,
    setActiveConversation, setActiveGroup, setActiveView,
    addConversation, getConversationsByFriend,
  } = useAppStore()

  const [searchQuery, setSearchQuery] = useState('')
  const [expandedFriends, setExpandedFriends] = useState<Record<string, boolean>>({})

  const toggleFriend = (id: string) => {
    setExpandedFriends(prev => ({ ...prev, [id]: !prev[id] }))
  }

  const filteredFriends = friends.filter(f =>
    f.name.toLowerCase().includes(searchQuery.toLowerCase())
  )
  const filteredGroups = groups.filter(g =>
    g.name.toLowerCase().includes(searchQuery.toLowerCase())
  )

  const getFriendConversations = (friendId: string) => {
    return conversations.filter(c => c.friendId === friendId)
  }

  const getLastMessage = (friendId: string) => {
    const convs = getFriendConversations(friendId)
    if (convs.length === 0) return '点击开始对话'
    const last = convs.sort((a, b) => b.lastActiveAt - a.lastActiveAt)[0]
    if (last.messages.length === 0) return '新对话'
    const lastMsg = last.messages[last.messages.length - 1]
    return lastMsg.content.slice(0, 30)
  }

  const handleFriendClick = (friendId: string) => {
    const convs = getFriendConversations(friendId)
    if (convs.length === 0) {
      const id = addConversation(friendId, '默认对话')
      setActiveConversation(id)
      setActiveGroup(null)
      setActiveView('main')
    } else if (convs.length === 1) {
      setActiveConversation(convs[0].id)
      setActiveGroup(null)
      setActiveView('main')
    } else {
      toggleFriend(friendId)
    }
  }

  const handleSelectConversation = (convId: string) => {
    setActiveConversation(convId)
    setActiveGroup(null)
    setActiveView('main')
  }

  const handleSelectGroup = (groupId: string) => {
    setActiveGroup(groupId)
    setActiveConversation(null)
    setActiveView('main')
  }

  return (
    <div style={{ width: 240, background: '#0e0f1a', borderRight: '1px solid #262736' }}
      className="h-full flex flex-col overflow-hidden shrink-0">

      {/* Search */}
      <div className="p-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: '#8e9299' }} />
          <input
            type="text"
            placeholder="搜索..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            style={{
              width: '100%', background: 'rgba(255,255,255,0.05)',
              border: '1px solid #262736', borderRadius: 8,
              padding: '8px 12px 8px 36px', fontSize: 13, color: '#fff', outline: 'none',
            }}
            onFocus={e => (e.target.style.borderColor = '#4285f4')}
            onBlur={e => (e.target.style.borderColor = '#262736')}
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-2 space-y-6 pb-4">
        {/* Friends */}
        {filteredFriends.length > 0 && (
          <div>
            <div className="flex items-center justify-between px-2 mb-2">
              <h3 style={{ fontSize: 11, fontWeight: 600, color: '#8e9299', letterSpacing: '0.08em', textTransform: 'uppercase' }}>好友</h3>
              <button
                onClick={() => setActiveView('settings')}
                className="p-1 rounded transition-colors hover:bg-white/5"
                style={{ color: '#8e9299' }}
              >
                <Plus className="w-3 h-3" />
              </button>
            </div>

            <div className="space-y-1">
              {filteredFriends.map(friend => {
                const convs = getFriendConversations(friend.id)
                const isExpanded = expandedFriends[friend.id]
                return (
                  <div key={friend.id}>
                    <div
                      className={cn('sidebar-item group', isExpanded && 'bg-white/5')}
                      onClick={() => handleFriendClick(friend.id)}
                    >
                      <div
                        className="w-8 h-8 rounded-full flex-shrink-0 flex items-center justify-center text-white font-bold text-xs"
                        style={{ backgroundColor: friend.avatar }}
                      >
                        {friend.name[0]}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-medium truncate">{friend.name}</span>
                          {convs.length > 1 && (
                            isExpanded
                              ? <ChevronDown className="w-3 h-3 flex-shrink-0" style={{ color: '#8e9299' }} />
                              : <ChevronRight className="w-3 h-3 flex-shrink-0" style={{ color: '#8e9299' }} />
                          )}
                        </div>
                        <p className="text-xs truncate" style={{ color: '#8e9299' }}>{getLastMessage(friend.id)}</p>
                      </div>
                    </div>

                    {isExpanded && convs.length > 0 && (
                      <div className="ml-11 mt-1 space-y-1">
                        {convs.map(conv => (
                          <div
                            key={conv.id}
                            onClick={() => handleSelectConversation(conv.id)}
                            className="px-3 py-1.5 rounded-md text-xs cursor-pointer transition-colors"
                            style={{
                              background: activeConversationId === conv.id ? 'rgba(66,133,244,0.2)' : 'transparent',
                              color: activeConversationId === conv.id ? '#4285f4' : '#8e9299',
                            }}
                            onMouseEnter={e => {
                              if (activeConversationId !== conv.id)
                                (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.05)'
                            }}
                            onMouseLeave={e => {
                              if (activeConversationId !== conv.id)
                                (e.currentTarget as HTMLElement).style.background = 'transparent'
                            }}
                          >
                            {conv.name}
                          </div>
                        ))}
                        <button
                          className="w-full text-left px-3 py-1.5 rounded-md text-xs transition-colors flex items-center gap-2"
                          style={{ color: '#8e9299' }}
                          onClick={() => {
                            const id = addConversation(friend.id, `对话 ${convs.length + 1}`)
                            handleSelectConversation(id)
                          }}
                        >
                          <Plus className="w-3 h-3" /> 新建对话
                        </button>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* Groups */}
        {filteredGroups.length > 0 && (
          <div>
            <div className="flex items-center justify-between px-2 mb-2">
              <h3 style={{ fontSize: 11, fontWeight: 600, color: '#8e9299', letterSpacing: '0.08em', textTransform: 'uppercase' }}>群组</h3>
            </div>
            <div className="space-y-1">
              {filteredGroups.map(group => (
                <div
                  key={group.id}
                  className={cn('sidebar-item', activeGroupId === group.id && 'sidebar-item-active')}
                  onClick={() => handleSelectGroup(group.id)}
                >
                  <div className="w-8 h-8 rounded-lg flex-shrink-0 flex items-center justify-center"
                    style={{ background: 'rgba(255,255,255,0.1)' }}>
                    <Users className="w-4 h-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium truncate">{group.name}</span>
                      <span style={{ fontSize: 10, color: '#8e9299' }}>{group.members.length}</span>
                    </div>
                    <div className="flex gap-1 mt-0.5">
                      {group.members.slice(0, 4).map((m, i) => {
                        const f = friends.find(fr => fr.id === m.friendId)
                        return (
                          <div
                            key={i}
                            className="w-3 h-3 rounded-full flex-shrink-0"
                            style={{ backgroundColor: f?.avatar || '#ccc', border: '1px solid #0e0f1a' }}
                            title={f?.name}
                          />
                        )
                      })}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {filteredFriends.length === 0 && filteredGroups.length === 0 && (
          <div className="text-center py-8" style={{ color: '#8e9299', fontSize: 13 }}>
            <Users className="w-8 h-8 mx-auto mb-2 opacity-20" />
            没有联系人
          </div>
        )}
      </div>

      {/* Bottom: Settings */}
      <div className="p-3" style={{ borderTop: '1px solid #262736' }}>
        <div className="sidebar-item" onClick={() => setActiveView('settings')}>
          <div className="w-8 h-8 rounded-full flex items-center justify-center"
            style={{ background: '#4285f4' }}>
            <User className="w-4 h-4 text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <span className="text-sm font-medium block truncate">用户设置</span>
            <span className="text-xs block truncate" style={{ color: '#8e9299' }}>API Keys & 配置</span>
          </div>
        </div>
      </div>
    </div>
  )
}
