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
import { Button } from '@/components/ui/button'
import { MessageSquare, LayoutGrid, Bot, Settings, PanelRight, Zap, Menu } from 'lucide-react'

export function MainLayout() {
  const { activeView, setActiveView, toggleSidebar, tasks, hydrate, friends, groups, activeConversationId, conversations } = useAppStore()
  const [showContactSidebar, setShowContactSidebar] = useState(true)
  const runningTasks = tasks.filter(t => t.status === 'running').length

  // Get active friend and conversation
  const activeConversation = conversations.find(c => c.id === activeConversationId)
  const activeFriend = activeConversation ? friends.find(f => f.id === activeConversation.friendId) : null

  useEffect(() => { hydrate() }, [])

  const navItems = [
    { id: 'main' as const, label: '主界面', icon: MessageSquare },
    { id: 'feature' as const, label: '功能区', icon: LayoutGrid },
    { id: 'outer' as const, label: '外层对话', icon: Bot },
    { id: 'settings' as const, label: '设置', icon: Settings },
  ]

  // If viewing a 1:1 conversation, show FriendChatView instead
  if (activeConversation && activeFriend) {
    return (
      <div className="flex flex-col h-screen bg-gray-100">
        {/* Top nav with back button and settings */}
        <header className="border-b bg-white px-4 py-0 flex items-center justify-between shrink-0 h-12 shadow-sm">
          <div className="flex items-center gap-0.5">
            <div className="flex items-center gap-1.5 mr-4 pr-4 border-r">
              <Zap className="h-4 w-4 text-blue-500" />
              <span className="font-bold text-sm text-gray-800">AI 协作平台</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {navItems.map(item => (
              <button
                key={item.id}
                onClick={() => setActiveView(item.id)}
                className={`flex items-center gap-1.5 px-3 h-12 text-sm transition-all border-b-2 ${
                  activeView === item.id
                    ? 'border-blue-500 text-blue-600 font-medium'
                    : 'border-transparent text-gray-500 hover:text-gray-800 hover:bg-gray-50'
                }`}
              >
                <item.icon className="h-4 w-4" />
                {item.label}
              </button>
            ))}
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={toggleSidebar}
            className="relative text-xs gap-1.5 h-8 border-gray-200"
          >
            <PanelRight className="h-3.5 w-3.5" />
            控制台
            {runningTasks > 0 && (
              <span className="absolute -top-1.5 -right-1.5 bg-blue-500 text-white text-[10px] rounded-full w-4 h-4 flex items-center justify-center font-bold">
                {runningTasks}
              </span>
            )}
          </Button>
        </header>

        {/* Main content with sidebar */}
        <main className="flex-1 overflow-hidden">
          <div className="flex h-full">
            {/* Contact sidebar */}
            {showContactSidebar && (
              <ContactSidebar
                activeConversationId={activeConversationId}
                onSelectConversation={() => {}}
                onSelectGroup={() => {}}
              />
            )}
            
            {/* Content area */}
            <div className="flex-1 bg-white overflow-hidden flex flex-col">
              {activeView === 'main' && <FriendChatView conversation={activeConversation} friend={activeFriend} onBack={() => setActiveView('main')} />}
              {activeView === 'feature' && <FeatureView />}
              {activeView === 'outer' && <OuterDialog />}
              {activeView === 'settings' && <SettingsView />}
            </div>
          </div>
        </main>

        <EngineerSidebar />
      </div>
    )
  }

  return (
    <div className="flex flex-col h-screen bg-gray-100">
      {/* Top nav */}
      <header className="border-b bg-white px-4 py-0 flex items-center justify-between shrink-0 h-12 shadow-sm">
        <div className="flex items-center gap-0.5">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setShowContactSidebar(!showContactSidebar)}
            className="h-8 w-8 mr-2"
          >
            <Menu className="h-4 w-4" />
          </Button>
          <div className="flex items-center gap-1.5 mr-4 pr-4 border-r">
            <Zap className="h-4 w-4 text-blue-500" />
            <span className="font-bold text-sm text-gray-800">AI 协作平台</span>
          </div>
          {navItems.map(item => (
            <button
              key={item.id}
              onClick={() => setActiveView(item.id)}
              className={`flex items-center gap-1.5 px-3 h-12 text-sm transition-all border-b-2 ${
                activeView === item.id
                  ? 'border-blue-500 text-blue-600 font-medium'
                  : 'border-transparent text-gray-500 hover:text-gray-800 hover:bg-gray-50'
              }`}
            >
              <item.icon className="h-4 w-4" />
              {item.label}
            </button>
          ))}
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={toggleSidebar}
          className="relative text-xs gap-1.5 h-8 border-gray-200"
        >
          <PanelRight className="h-3.5 w-3.5" />
          控制台
          {runningTasks > 0 && (
            <span className="absolute -top-1.5 -right-1.5 bg-blue-500 text-white text-[10px] rounded-full w-4 h-4 flex items-center justify-center font-bold">
              {runningTasks}
            </span>
          )}
        </Button>
      </header>

      {/* Main content with sidebar */}
      <main className="flex-1 overflow-hidden">
        <div className="flex h-full">
          {/* Contact sidebar */}
          {showContactSidebar && (
            <ContactSidebar
              activeConversationId={activeConversationId}
              onSelectConversation={() => {}}
              onSelectGroup={() => {}}
            />
          )}
          
          {/* Content area */}
          <div className="flex-1 bg-white overflow-hidden">
            {activeView === 'main' && <MainView />}
            {activeView === 'feature' && <FeatureView />}
            {activeView === 'outer' && <OuterDialog />}
            {activeView === 'settings' && <SettingsView />}
          </div>
        </div>
      </main>

      <EngineerSidebar />
    </div>
  )
}
