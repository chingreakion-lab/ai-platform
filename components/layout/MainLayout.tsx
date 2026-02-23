"use client"
import { useEffect, useState } from 'react'
import { useAppStore } from '@/lib/store'
import { MainView } from '@/components/views/MainView'
import { FriendChatView } from '@/components/views/FriendChatView'
import { FeatureView } from '@/components/views/FeatureView'
import { OuterDialog } from '@/components/views/OuterDialog'
import { SettingsView } from '@/components/views/SettingsView'
import { ContactSidebar } from '@/components/sidebar/ContactSidebar'
import { EngineerSidebar } from '@/components/layout/EngineerSidebar'
import { MessageSquare, LayoutGrid, Bot, Settings, Zap, PanelRight } from 'lucide-react'
import { cn } from '@/lib/utils'

export function MainLayout() {
  const {
    activeView, setActiveView, toggleSidebar, tasks, hydrate,
    friends, groups, activeConversationId, conversations,
    setActiveGroup, setActiveConversation
  } = useAppStore()

  const runningTasks = tasks.filter(t => t.status === 'running').length
  const activeConversation = conversations.find(c => c.id === activeConversationId)
  const activeFriend = activeConversation ? friends.find(f => f.id === activeConversation.friendId) : null

  const handleSelectGroup = (groupId: string) => {
    setActiveGroup(groupId)
    setActiveConversation(null)
    setActiveView('main')
  }

  const handleSelectConversation = (convId: string) => {
    setActiveConversation(convId)
  }

  useEffect(() => { hydrate() }, [])

  const navItems = [
    { id: 'main' as const, icon: MessageSquare, label: '对话' },
    { id: 'feature' as const, icon: LayoutGrid, label: '功能区' },
    { id: 'outer' as const, icon: Bot, label: '外层' },
  ]

  const isInConversation = !!(activeConversation && activeFriend)

  const renderContent = () => {
    if (isInConversation) {
      return <FriendChatView conversation={activeConversation!} friend={activeFriend!} onBack={() => setActiveConversation(null)} />
    }
    if (activeView === 'feature') return <FeatureView />
    if (activeView === 'outer') return <OuterDialog />
    if (activeView === 'settings') return <SettingsView />
    return <MainView />
  }

  return (
    <div className="flex h-screen overflow-hidden" style={{ background: '#0b0c14', color: '#e8e9f0' }}>

      {/* ── Icon rail ── */}
      <nav className="w-14 shrink-0 h-full flex flex-col items-center py-4 gap-1"
        style={{ background: '#080910', borderRight: '1px solid rgba(255,255,255,0.06)' }}>

        {/* Logo */}
        <div className="w-9 h-9 rounded-xl flex items-center justify-center mb-5 shadow-lg"
          style={{ background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', boxShadow: '0 4px 16px rgba(99,102,241,0.4)' }}>
          <Zap className="h-4 w-4 text-white" />
        </div>

        {/* Nav items */}
        {navItems.map(item => {
          const isActive = activeView === item.id && !isInConversation
          return (
            <button
              key={item.id}
              onClick={() => { setActiveView(item.id); setActiveConversation(null) }}
              title={item.label}
              className="relative w-10 h-10 rounded-xl flex items-center justify-center transition-all duration-200"
              style={{
                background: isActive ? 'rgba(99,102,241,0.2)' : 'transparent',
                color: isActive ? '#818cf8' : 'rgba(255,255,255,0.3)',
              }}
              onMouseEnter={e => { if (!isActive) (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.05)' }}
              onMouseLeave={e => { if (!isActive) (e.currentTarget as HTMLButtonElement).style.background = 'transparent' }}
            >
              <item.icon className="h-5 w-5" />
              {item.id === 'main' && runningTasks > 0 && (
                <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 rounded-full bg-indigo-400 animate-pulse" />
              )}
            </button>
          )
        })}

        <div className="flex-1" />

        {/* Settings */}
        <button
          onClick={() => { setActiveView('settings'); setActiveConversation(null) }}
          title="设置"
          className="w-10 h-10 rounded-xl flex items-center justify-center transition-all duration-200"
          style={{
            background: activeView === 'settings' ? 'rgba(99,102,241,0.2)' : 'transparent',
            color: activeView === 'settings' ? '#818cf8' : 'rgba(255,255,255,0.3)',
          }}
          onMouseEnter={e => { if (activeView !== 'settings') (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.05)' }}
          onMouseLeave={e => { if (activeView !== 'settings') (e.currentTarget as HTMLButtonElement).style.background = 'transparent' }}
        >
          <Settings className="h-5 w-5" />
        </button>

        {/* Console toggle */}
        <button
          onClick={toggleSidebar}
          title="控制台"
          className="w-10 h-10 rounded-xl flex items-center justify-center transition-all duration-200 relative mt-1"
          style={{ color: 'rgba(255,255,255,0.3)' }}
          onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.05)'; (e.currentTarget as HTMLButtonElement).style.color = 'rgba(255,255,255,0.7)' }}
          onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'transparent'; (e.currentTarget as HTMLButtonElement).style.color = 'rgba(255,255,255,0.3)' }}
        >
          <PanelRight className="h-5 w-5" />
          {runningTasks > 0 && (
            <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-indigo-400 text-[8px] flex items-center justify-center text-white font-bold animate-pulse">
              {runningTasks}
            </span>
          )}
        </button>
      </nav>

      {/* ── Contact sidebar ── */}
      <ContactSidebar />

      {/* ── Main content ── */}
      <main className="flex-1 overflow-hidden">
        {renderContent()}
      </main>

      <EngineerSidebar />
    </div>
  )
}

