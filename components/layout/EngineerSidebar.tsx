"use client"
import { useAppStore } from '@/lib/store'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { X, CheckCircle2, XCircle, Clock, Loader2, Trash2, Terminal } from 'lucide-react'
import { format } from 'date-fns'

export function EngineerSidebar() {
  const { sidebarOpen, setSidebarOpen, tasks, logs, clearLogs } = useAppStore()

  if (!sidebarOpen) return null

  const taskStatusIcon = {
    pending: <Clock className="h-3.5 w-3.5 text-gray-400 shrink-0" />,
    running: <Loader2 className="h-3.5 w-3.5 text-blue-400 animate-spin shrink-0" />,
    done: <CheckCircle2 className="h-3.5 w-3.5 text-green-400 shrink-0" />,
    failed: <XCircle className="h-3.5 w-3.5 text-red-400 shrink-0" />,
  }

  const logLevelStyle = {
    info: 'text-blue-400',
    warn: 'text-yellow-400',
    error: 'text-red-400',
    success: 'text-green-400',
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={() => setSidebarOpen(false)} />
      <div className="relative w-80 bg-[#1a1a1a] text-white flex flex-col shadow-2xl border-l border-[#2d2d2d]">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-[#2d2d2d]">
          <div className="flex items-center gap-2">
            <Terminal className="h-4 w-4 text-green-400" />
            <span className="text-sm font-semibold text-gray-200">工程师控制台</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
            <Button variant="ghost" size="icon" className="h-6 w-6 text-gray-500 hover:text-white hover:bg-[#2d2d2d]"
              onClick={() => setSidebarOpen(false)}>
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>

        <Tabs defaultValue="tasks" className="flex-1 flex flex-col overflow-hidden">
          <TabsList className="mx-3 mt-3 mb-1 bg-[#252525] border border-[#333] rounded-md p-0.5 h-8">
            <TabsTrigger value="tasks" className="flex-1 text-xs h-7 data-[state=active]:bg-[#333] data-[state=active]:text-white text-gray-500 rounded">
              任务 {tasks.length > 0 && <span className="ml-1 bg-[#444] rounded px-1 text-[10px]">{tasks.length}</span>}
            </TabsTrigger>
            <TabsTrigger value="logs" className="flex-1 text-xs h-7 data-[state=active]:bg-[#333] data-[state=active]:text-white text-gray-500 rounded">
              日志 {logs.length > 0 && <span className="ml-1 bg-[#444] rounded px-1 text-[10px]">{logs.length}</span>}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="tasks" className="flex-1 overflow-hidden mt-0">
            <ScrollArea className="h-full">
              <div className="px-3 pb-4 space-y-2 pt-2">
                {tasks.length === 0 && (
                  <div className="text-center py-12">
                    <Clock className="h-8 w-8 text-[#333] mx-auto mb-2" />
                    <p className="text-[#555] text-xs">暂无任务</p>
                  </div>
                )}
                {[...tasks].reverse().map(task => (
                  <div key={task.id} className="bg-[#222] border border-[#2d2d2d] rounded-lg p-2.5 hover:border-[#3d3d3d] transition-colors">
                    <div className="flex items-start gap-2">
                      <div className="mt-0.5">{taskStatusIcon[task.status]}</div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium text-gray-300 leading-tight">{task.title}</p>
                        {task.description && (
                          <p className="text-[11px] text-gray-500 mt-0.5 line-clamp-2">{task.description}</p>
                        )}
                        {task.result && (
                          <p className="text-[11px] text-gray-400 mt-1 line-clamp-2 italic border-l-2 border-[#3d3d3d] pl-2">{task.result}</p>
                        )}
                        <p className="text-[10px] text-[#444] mt-1">{format(task.createdAt, 'MM-dd HH:mm:ss')}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
          </TabsContent>

          <TabsContent value="logs" className="flex-1 overflow-hidden mt-0">
            <div className="flex items-center justify-between px-3 py-1.5">
              <span className="text-[10px] text-[#444] font-mono">SYSTEM LOG</span>
              <Button variant="ghost" size="sm"
                className="h-5 text-[10px] text-[#555] hover:text-white hover:bg-[#2d2d2d] px-2"
                onClick={clearLogs}>
                <Trash2 className="h-2.5 w-2.5 mr-1" /> 清空
              </Button>
            </div>
            <ScrollArea className="h-full">
              <div className="px-3 pb-4 space-y-0.5 font-mono">
                {logs.length === 0 && (
                  <div className="text-center py-12">
                    <p className="text-[#555] text-xs">暂无日志</p>
                  </div>
                )}
                {logs.map(log => (
                  <div key={log.id} className="text-[11px] flex gap-2 py-0.5 hover:bg-[#222] rounded px-1">
                    <span className="text-[#444] shrink-0 tabular-nums">{format(log.timestamp, 'HH:mm:ss')}</span>
                    <span className={`shrink-0 w-12 ${logLevelStyle[log.level]}`}>[{log.level.toUpperCase()}]</span>
                    <span className="text-gray-400 break-all">{log.message}</span>
                  </div>
                ))}
              </div>
            </ScrollArea>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  )
}
