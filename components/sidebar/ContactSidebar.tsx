"use client"
import { useState } from 'react'
import { useAppStore } from '@/lib/store'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { ChevronDown, ChevronRight, Plus, Users } from 'lucide-react'
import { AIFriend, Group, Conversation } from '@/lib/types'

interface ContactSidebarProps {
  activeConversationId?: string | null
  onSelectConversation?: (id: string) => void
  onSelectGroup?: (id: string) => void
}

export function ContactSidebar({ activeConversationId, onSelectConversation, onSelectGroup }: ContactSidebarProps) {
  const {
    friends,
    groups,
    conversations,
    addConversation,
    getConversationsByFriend,
    setActiveConversation,
    setActiveView,
  } = useAppStore()

  const [expandedFriends, setExpandedFriends] = useState<Set<string>>(new Set(friends.map(f => f.id).slice(0, 1)))
  const [newConversationName, setNewConversationName] = useState('')
  const [isAddingConversation, setIsAddingConversation] = useState<string | null>(null)

  const toggleFriendExpanded = (friendId: string) => {
    const next = new Set(expandedFriends)
    if (next.has(friendId)) {
      next.delete(friendId)
    } else {
      next.add(friendId)
    }
    setExpandedFriends(next)
  }

  const handleAddConversation = (friendId: string) => {
    if (newConversationName.trim()) {
      addConversation(friendId, newConversationName)
      setNewConversationName('')
      setIsAddingConversation(null)
    }
  }

  const handleSelectConversation = (conversationId: string) => {
    setActiveConversation(conversationId)
    setActiveView('main')
    onSelectConversation?.(conversationId)
  }

  const handleSelectGroup = (groupId: string) => {
    setActiveView('main')
    onSelectGroup?.(groupId)
  }

  // One-click chat: if friend has no conversations auto-create one
  const handleFriendClick = (friend: AIFriend) => {
    const friendConversations = getConversationsByFriend(friend.id)
    if (friendConversations.length === 0) {
      const newId = addConversation(friend.id, '默认对话')
      setActiveView('main')
      onSelectConversation?.(newId)
    } else if (friendConversations.length === 1) {
      // Only one conv, open it directly
      handleSelectConversation(friendConversations[0].id)
    } else {
      toggleFriendExpanded(friend.id)
    }
  }

  return (
    <div className="flex flex-col h-full bg-[#13131e] border-r border-white/10 w-64">
      {/* Header */}
      <div className="p-4 border-b flex items-center justify-between">
        <h2 className="font-semibold text-sm text-white/75">联系人</h2>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-2 space-y-1">
          {/* Friends Section */}
          {friends.length > 0 && (
            <div>
              <div className="text-xs font-semibold text-white/40 px-2 py-2 uppercase">好友</div>
              {friends.map(friend => {
                const friendConversations = getConversationsByFriend(friend.id)
                const isExpanded = expandedFriends.has(friend.id)

                return (
                  <div key={friend.id}>
                    {/* Friend Item */}
                    <button
                      onClick={() => handleFriendClick(friend)}
                      className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-[#252636] transition-colors text-left group"
                    >
                      <div className="flex items-center gap-2 flex-1">
                        {friendConversations.length > 1 && (
                          <span className="w-4 h-4 flex items-center justify-center text-white/60">
                            {isExpanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                          </span>
                        )}
                        {friendConversations.length <= 1 && <div className="w-4" />}
                        <Avatar className="h-6 w-6">
                          <AvatarFallback style={{ backgroundColor: friend.avatar }} className="text-white text-xs font-bold">
                            {friend.name.charAt(0)}
                          </AvatarFallback>
                        </Avatar>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-medium text-white/75 truncate">{friend.name}</p>
                          <p className="text-xs text-white/30 truncate">
                            {friendConversations.length === 0 ? <span className="text-blue-400">点击开始对话</span> : friend.role === 'chief' ? '主工程师' : '功能工程师'}
                          </p>
                        </div>
                      </div>
                      {isExpanded && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-5 w-5 opacity-0 group-hover:opacity-100 transition-opacity"
                          onClick={(e) => {
                            e.stopPropagation()
                            setIsAddingConversation(friend.id)
                          }}
                        >
                          <Plus className="h-3 w-3" />
                        </Button>
                      )}
                    </button>

                    {/* Conversations under friend */}
                    {isExpanded && friendConversations.length > 0 && (
                      <div className="ml-6 space-y-0.5 mb-1">
                        {friendConversations.map(conv => (
                          <button
                            key={conv.id}
                            onClick={() => handleSelectConversation(conv.id)}
                            className={`w-full text-left px-2 py-1.5 rounded-md text-xs transition-colors ${
                              activeConversationId === conv.id
                                ? 'bg-indigo-500/20 text-indigo-300 font-medium'
                                : 'text-white/60 hover:bg-[#252636]'
                            }`}
                          >
                            <p className="truncate">💬 {conv.name}</p>
                          </button>
                        ))}
                      </div>
                    )}

                    {/* Add conversation input */}
                    {isAddingConversation === friend.id && (
                      <div className="ml-6 p-1.5 mb-1 space-y-1 bg-[#0e0f1a] rounded border border-blue-200">
                        <Input
                          placeholder="对话名称..."
                          value={newConversationName}
                          onChange={(e) => setNewConversationName(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') handleAddConversation(friend.id)
                            if (e.key === 'Escape') setIsAddingConversation(null)
                          }}
                          className="h-7 text-xs"
                          autoFocus
                        />
                        <div className="flex gap-1">
                          <Button
                            size="sm"
                            className="h-6 text-xs flex-1"
                            onClick={() => handleAddConversation(friend.id)}
                          >
                            添加
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-6 text-xs flex-1"
                            onClick={() => setIsAddingConversation(null)}
                          >
                            取消
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}

          {/* Groups Section */}
          {groups.length > 0 && (
            <div className="mt-3">
              <div className="text-xs font-semibold text-white/40 px-2 py-2 uppercase">群组</div>
              {groups.map(group => (
                <button
                  key={group.id}
                  onClick={() => handleSelectGroup(group.id)}
                  className="w-full text-left px-2 py-1.5 rounded-md hover:bg-[#252636] transition-colors group"
                >
                  <div className="flex items-center gap-2">
                    <Users className="h-4 w-4 text-white/40 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-white/75 truncate">{group.name}</p>
                      <p className="text-xs text-white/30">{group.members.length} 人</p>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}

          {/* Empty state */}
          {friends.length === 0 && groups.length === 0 && (
            <div className="text-center py-8 text-xs" style={{ color: 'rgba(255,255,255,0.25)' }}>
              <Users className="h-6 w-6 mx-auto mb-2" style={{ color: 'rgba(255,255,255,0.15)' }} />
              没有联系人，请先添加好友或创建群组
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  )
}
