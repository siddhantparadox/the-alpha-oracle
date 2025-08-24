'use client';

import React, { useState, useRef, useEffect } from 'react';
import { Send, Loader2, AlertCircle, TrendingUp, Sparkles, Clock, CheckCircle2, X, Activity } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { cn } from '@/lib/utils';
import { useSettings, useConversation, Message, PlanStep } from '@/lib/store/api-keys';
import { MarkdownRenderer } from './markdown-renderer';
import { SettingsModal } from './settings-modal';
import { SSEConsumer } from '@/lib/sse/stream-helper';
import { ExecutionResult } from '@/lib/agents/executor';
import { ResearchSummary } from './research-summary';

export function ChatInterface() {
  const { openRouterKey, hasValidKey, maxSteps } = useSettings();
  const {
    messages,
    isLoading,
    currentPlan,
    addMessage,
    setLoading,
    setPlan,
    clearMessages
  } = useConversation();

  const [input, setInput] = useState('');
  const [streamingMessage, setStreamingMessage] = useState('');
  const [executionResults, setExecutionResults] = useState<ExecutionResult[]>([]);
  const [planPanelWidth, setPlanPanelWidth] = useState(380); // Increased default width for descriptions
  const [isDragging, setIsDragging] = useState(false);
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const dragStartX = useRef(0);
  const dragStartWidth = useRef(0);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    if (scrollAreaRef.current) {
      const scrollContainer = scrollAreaRef.current.querySelector('[data-radix-scroll-area-viewport]');
      if (scrollContainer) {
        scrollContainer.scrollTop = scrollContainer.scrollHeight;
      }
    }
  }, [messages, streamingMessage]);

  const handleSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    
    if (!input.trim() || isLoading || !hasValidKey()) {
      return;
    }

    const userMessage = input.trim();
    setInput('');
    addMessage({ role: 'user', content: userMessage });
    setLoading(true);
    setStreamingMessage('');
    setPlan([]);
    setExecutionResults([]);

    try {
      // Phase 1: Plan and Execute
      const planResponse = await fetch('/api/plan-run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: userMessage,
          openrouterKey: openRouterKey,
          conversationHistory: messages.slice(-10), // Last 10 messages for context
          maxSteps,
        }),
      });

      if (!planResponse.ok) {
        throw new Error('Failed to generate plan');
      }

      const sse = new SSEConsumer(planResponse);
      const tempResults: ExecutionResult[] = [];
      let currentSteps: PlanStep[] = [];

      for await (const event of sse) {
        if (event.event === 'plan') {
          const planData = JSON.parse(event.data);
          currentSteps = planData.steps.map((step: string | PlanStep) => {
            if (typeof step === 'string') {
              return {
                title: step,
                description: step,
                status: 'pending' as const,
                progressMessage: '',
                elapsedTime: 0
              };
            }
            return {
              ...step,
              status: 'pending' as const,
              progressMessage: '',
              elapsedTime: 0
            };
          });
          setPlan(currentSteps);
        } else if (event.event === 'stepStart') {
          const startData = JSON.parse(event.data);
          if (currentSteps[startData.stepIndex]) {
            const updatedSteps = [...currentSteps];
            updatedSteps[startData.stepIndex] = {
              ...updatedSteps[startData.stepIndex],
              status: 'running',
              progressMessage: 'Starting...'
            };
            setPlan(updatedSteps);
          }
        } else if (event.event === 'stepProgress') {
          const progressData = JSON.parse(event.data);
          if (currentSteps[progressData.stepIndex]) {
            const updatedSteps = [...currentSteps];
            updatedSteps[progressData.stepIndex] = {
              ...updatedSteps[progressData.stepIndex],
              progressMessage: progressData.message,
              elapsedTime: progressData.elapsedTime
            };
            setPlan(updatedSteps);
          }
        } else if (event.event === 'status') {
          const statusData = JSON.parse(event.data);
          if (statusData.currentStep && currentSteps.length > 0) {
            const updatedSteps = [...currentSteps];
            // Mark previous steps as done
            for (let i = 0; i < statusData.currentStep - 1; i++) {
              if (updatedSteps[i]) {
                updatedSteps[i].status = 'done';
              }
            }
            // Mark current step as running
            if (updatedSteps[statusData.currentStep - 1]) {
              updatedSteps[statusData.currentStep - 1].status = 'running';
            }
            setPlan(updatedSteps);
          }
        } else if (event.event === 'stepComplete') {
          const stepData = JSON.parse(event.data);
          if (currentSteps[stepData.stepIndex]) {
            const updatedSteps = [...currentSteps];
            updatedSteps[stepData.stepIndex].status = 'done';
            updatedSteps[stepData.stepIndex].summary = stepData.summary;
            setPlan(updatedSteps);
          }
        } else if (event.event === 'stepError') {
          const errorData = JSON.parse(event.data);
          if (currentSteps[errorData.stepIndex]) {
            const updatedSteps = [...currentSteps];
            updatedSteps[errorData.stepIndex].status = 'failed';
            setPlan(updatedSteps);
          }
        } else if (event.event === 'executionResults') {
          // NEW: Handle dedicated execution results event
          const resultsData = JSON.parse(event.data);
          console.log('Execution results event received:', {
            hasResults: !!resultsData.results,
            resultsLength: resultsData.results?.length || 0,
            resultsPreview: resultsData.results?.slice(0, 2).map((r: ExecutionResult) => ({
              stepTitle: r?.step?.title,
              provider: r?.provider,
              hasData: !!r?.data,
            })),
          });
          
          if (resultsData.results && Array.isArray(resultsData.results)) {
            tempResults.push(...resultsData.results);
            console.log('Stored execution results from dedicated event:', tempResults.length);
          } else {
            console.warn('No results found in execution results event!');
          }
        } else if (event.event === 'summary') {
          const summaryData = JSON.parse(event.data);
          console.log('Summary event received:', {
            hasSummary: !!summaryData.summary,
            summaryLength: summaryData.summary?.length || 0,
          });
          
          // Note: execution results now come in a separate event
          // This is just for backward compatibility
          if (summaryData.results && Array.isArray(summaryData.results)) {
            tempResults.push(...summaryData.results);
            console.log('Stored execution results from summary (legacy):', tempResults.length);
          }
        } else if (event.event === 'done') {
          // Mark all steps as done
          const finalSteps = currentSteps.map(step => ({ ...step, status: 'done' as const }));
          setPlan(finalSteps);
        }
      }

      setExecutionResults(tempResults);
      
      console.log('About to send answer request with execution results:', {
        tempResultsLength: tempResults.length,
        tempResultsSample: tempResults.slice(0, 2).map(r => ({
          stepTitle: r?.step?.title,
          hasData: !!r?.data,
          dataSize: r?.data ? JSON.stringify(r.data).length : 0,
        })),
      });

      // Phase 2: Generate Answer
      const answerResponse = await fetch('/api/answer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: userMessage,
          executionResults: tempResults,
          openrouterKey: openRouterKey,
          conversationHistory: messages.slice(-10),
        }),
      });

      if (!answerResponse.ok) {
        throw new Error('Failed to generate answer');
      }

      const answerSSE = new SSEConsumer(answerResponse);
      let fullAnswer = '';

      for await (const event of answerSSE) {
        if (event.event === 'delta') {
          const deltaData = JSON.parse(event.data);
          fullAnswer += deltaData.content;
          setStreamingMessage(fullAnswer);
        } else if (event.event === 'done') {
          addMessage({ role: 'assistant', content: fullAnswer });
          setStreamingMessage('');
        }
      }
    } catch (error) {
      console.error('Error in chat:', error);
      addMessage({
        role: 'assistant',
        content: `❌ An error occurred: ${error instanceof Error ? error.message : 'Unknown error'}`,
      });
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  // Handle resize drag
  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsDragging(true);
    dragStartX.current = e.clientX;
    dragStartWidth.current = planPanelWidth;
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging) return;
      
      const deltaX = dragStartX.current - e.clientX;
      const newWidth = Math.max(240, Math.min(600, dragStartWidth.current + deltaX));
      setPlanPanelWidth(newWidth);
    };

    const handleMouseUp = () => {
      setIsDragging(false);
    };

    if (isDragging) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
  }, [isDragging]);

  return (
    <div className="flex h-screen bg-background overflow-hidden">
      {/* Main Chat Area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <div className="border-b px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <TrendingUp className="h-6 w-6 text-primary" />
              <h1 className="text-xl font-bold">The Alpha Oracle</h1>
            </div>
            <span className="text-xs text-muted-foreground">AI Financial Research Assistant</span>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={clearMessages}
              disabled={messages.length === 0 || isLoading}
            >
              Clear
            </Button>
            <SettingsModal />
          </div>
        </div>

        {/* Messages Area */}
        <ScrollArea className="flex-1 px-6 overflow-y-auto" ref={scrollAreaRef}>
          <div className="max-w-3xl mx-auto py-6 min-h-full">
            {messages.length === 0 && !streamingMessage && (
              <div className="text-center py-12">
                <Sparkles className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                <h2 className="text-lg font-semibold mb-2">Welcome to The Alpha Oracle</h2>
                <p className="text-muted-foreground">
                  Ask me about stocks, market trends, financial news, or any investment research questions.
                </p>
                <div className="mt-6 flex flex-wrap gap-2 justify-center">
                  {[
                    "What's the latest on NVDA?",
                    "Show me Tesla's recent performance",
                    "What are today's market movers?",
                    "Analyze Apple vs Microsoft stocks",
                  ].map((suggestion) => (
                    <Button
                      key={suggestion}
                      variant="outline"
                      size="sm"
                      onClick={() => setInput(suggestion)}
                      disabled={isLoading || !hasValidKey()}
                    >
                      {suggestion}
                    </Button>
                  ))}
                </div>
              </div>
            )}

            {messages.map((message) => (
              <div
                key={message.id}
                className={cn(
                  "mb-6",
                  message.role === 'user' && "flex justify-end"
                )}
              >
                <div
                  className={cn(
                    "px-4 py-3 rounded-lg max-w-[85%]",
                    message.role === 'user'
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted"
                  )}
                >
                  {message.role === 'user' ? (
                    <p className="whitespace-pre-wrap">{message.content}</p>
                  ) : (
                    <MarkdownRenderer content={message.content} />
                  )}
                </div>
              </div>
            ))}

            {streamingMessage && (
              <div className="mb-6">
                <div className="px-4 py-3 rounded-lg bg-muted max-w-[85%]">
                  <MarkdownRenderer content={streamingMessage} />
                </div>
              </div>
            )}

            {isLoading && !streamingMessage && (
              <div className="flex items-center gap-2 text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>Researching...</span>
              </div>
            )}
          </div>
        </ScrollArea>

        {/* Input Area */}
        <div className="border-t px-6 py-4">
          {!hasValidKey() && (
            <Alert className="mb-4">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                Please set your OpenRouter API key in Settings to start chatting.
              </AlertDescription>
            </Alert>
          )}
          
          <form onSubmit={handleSubmit} className="max-w-3xl mx-auto">
            <div className="flex gap-2">
              <Textarea
                ref={textareaRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Ask about stocks, markets, or financial news..."
                className="resize-none"
                rows={2}
                disabled={isLoading || !hasValidKey()}
              />
              <Button
                type="submit"
                size="icon"
                disabled={!input.trim() || isLoading || !hasValidKey()}
              >
                {isLoading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
              </Button>
            </div>
          </form>
        </div>
      </div>

      {/* Resize Handle */}
      <div
        className={cn(
          "w-1 bg-border hover:bg-primary/20 cursor-col-resize transition-colors relative group",
          isDragging && "bg-primary/30"
        )}
        onMouseDown={handleMouseDown}
      >
        <div className="absolute inset-y-0 -left-1 -right-1 group-hover:bg-primary/10" />
      </div>

      {/* Plan Rail */}
      <div
        className="border-l bg-gradient-to-b from-background to-muted/10 flex flex-col flex-shrink-0 overflow-hidden"
        style={{ width: `${planPanelWidth}px` }}
      >
        {/* Header */}
        <div className="flex-shrink-0 bg-gradient-to-b from-background via-purple-50/30 to-blue-50/30 dark:from-background dark:via-purple-950/5 dark:to-blue-950/5 border-b">
          <div className="p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <div className="p-1.5 rounded-lg bg-gradient-to-br from-purple-500 to-blue-500 shadow-sm">
                  <Sparkles className="h-3.5 w-3.5 text-white" />
                </div>
                <h3 className="font-semibold text-sm bg-gradient-to-r from-purple-600 to-blue-600 bg-clip-text text-transparent">
                  Research Plan
                </h3>
              </div>
              {currentPlan.length > 0 && (
                <span className="text-xs px-2.5 py-1 bg-white/70 dark:bg-gray-800/70 rounded-full font-medium">
                  {currentPlan.filter(s => s.status === 'done').length}/{currentPlan.length}
                </span>
              )}
            </div>
            {/* Progress Bar */}
            {currentPlan.length > 0 && (
              <div className="relative">
                <div className="h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-purple-500 to-blue-500 rounded-full transition-all duration-700 ease-out shadow-sm"
                    style={{
                      width: `${(currentPlan.filter(s => s.status === 'done').length / currentPlan.length) * 100}%`
                    }}
                  />
                </div>
              </div>
            )}
          </div>
        </div>
        
        {/* Steps */}
        <ScrollArea className="flex-1 px-4 py-4 overflow-y-auto">
          {currentPlan.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center space-y-3 text-muted-foreground">
              <div className="w-12 h-12 rounded-full bg-gradient-to-r from-purple-100 to-blue-100 dark:from-purple-900/20 dark:to-blue-900/20 flex items-center justify-center">
                <Sparkles className="w-6 h-6 text-purple-500" />
              </div>
              <p className="text-sm">No active research plan</p>
              <p className="text-xs opacity-60">Ask a question to start researching</p>
            </div>
          ) : (
            <div className="space-y-4">
              {currentPlan.map((step, index) => (
                <div key={index} className="relative">
                  <div className="flex gap-3">
                              {/* Status Icon */}
                              <div className="mt-0.5 flex-shrink-0">
                                {step.status === 'done' ? (
                                  <div className="relative">
                                    <div className="w-5 h-5 rounded-full bg-gradient-to-br from-green-400 to-green-600 flex items-center justify-center shadow-sm">
                                      <CheckCircle2 className="w-3 h-3 text-white" />
                                    </div>
                                  </div>
                                ) : step.status === 'running' ? (
                                  <div className="relative">
                                    <div className="absolute inset-0 rounded-full bg-blue-400 animate-ping opacity-20"></div>
                                    <div className="relative w-5 h-5 rounded-full bg-gradient-to-br from-blue-400 to-blue-600 flex items-center justify-center shadow-sm">
                                      <Activity className="w-3 h-3 text-white animate-pulse" />
                                    </div>
                                  </div>
                                ) : step.status === 'failed' ? (
                                  <div className="w-5 h-5 rounded-full bg-gradient-to-br from-red-400 to-red-600 flex items-center justify-center shadow-sm">
                                    <X className="w-3 h-3 text-white" />
                                  </div>
                                ) : (
                                  <div className="w-5 h-5 rounded-full bg-gray-200 dark:bg-gray-700 border-2 border-gray-300 dark:border-gray-600" />
                                )}
                              </div>
                    
                    {/* Step Content */}
                    <div className="flex-1 space-y-1 min-w-0">
                      {/* Description */}
                      <p className={cn(
                        "text-sm leading-relaxed transition-all",
                        step.status === 'done' && "text-gray-600 dark:text-gray-400",
                        step.status === 'running' && "text-gray-900 dark:text-gray-100 font-medium",
                        step.status === 'failed' && "text-red-600 dark:text-red-400",
                        step.status === 'pending' && "text-gray-400 dark:text-gray-600"
                      )}>
                        {step.description || step.title}
                      </p>
                      
                      {/* Progress Message for Running Steps */}
                      {step.status === 'running' && step.progressMessage && (
                        <div className="flex items-center gap-2 mt-2 ml-7">
                          <div className="px-2 py-1 bg-blue-50 dark:bg-blue-950/30 rounded-md flex items-center gap-2">
                            <Loader2 className="w-3 h-3 animate-spin text-blue-500" />
                            <p className="text-xs text-blue-600 dark:text-blue-400 font-medium">
                              {step.progressMessage}
                              {step.elapsedTime ? ` • ${step.elapsedTime}s` : ''}
                            </p>
                          </div>
                        </div>
                      )}
                      
                      {/* Summary for Completed Steps */}
                      {step.summary && step.status === 'done' && (
                        <div className="ml-7 mt-2 p-2 bg-gradient-to-r from-purple-50 to-blue-50 dark:from-purple-950/10 dark:to-blue-950/10 rounded-md border-l-2 border-purple-300 dark:border-purple-700">
                          <ResearchSummary summary={step.summary} />
                        </div>
                      )}
                      
                      {/* Error Message for Failed Steps */}
                      {step.summary && step.status === 'failed' && (
                        <div className="ml-6 mt-2 pl-3 border-l-2 border-red-200 dark:border-red-800">
                          <p className="text-xs text-red-600/70 dark:text-red-400/70">
                            {step.summary}
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
                  
                  {/* Connecting Line Between Steps */}
                  {index < currentPlan.length - 1 && (
                    <div className="absolute left-[9.5px] top-7 bottom-0 w-0.5 bg-gradient-to-b from-gray-300 via-gray-200 to-transparent dark:from-gray-600 dark:via-gray-700" />
                  )}
                </div>
              ))}
            </div>
          )}
        </ScrollArea>
      </div>
    </div>
  );
}