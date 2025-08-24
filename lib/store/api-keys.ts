import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface SettingsState {
  openRouterKey: string | null;
  model: string;
  maxSteps: number;
  setOpenRouterKey: (key: string) => void;
  setModel: (model: string) => void;
  setMaxSteps: (steps: number) => void;
  clearKeys: () => void;
  hasValidKey: () => boolean;
}

export const useSettings = create<SettingsState>()(
  persist(
    (set, get) => ({
      openRouterKey: null,
      model: 'anthropic/claude-sonnet-4',
      maxSteps: 7,
      
      setOpenRouterKey: (key: string) => {
        set({ openRouterKey: key });
      },
      
      setModel: (model: string) => {
        set({ model });
      },

      setMaxSteps: (steps: number) => {
        set({ maxSteps: steps });
      },
      
      clearKeys: () => {
        set({ openRouterKey: null });
      },
      
      hasValidKey: () => {
        const state = get();
        return !!state.openRouterKey && state.openRouterKey.length > 0;
      },
    }),
    {
      name: 'alpha-oracle-keys',
      partialize: (state) => ({
        openRouterKey: state.openRouterKey,
        model: state.model,
        maxSteps: state.maxSteps,
      }),
    }
  )
);

// Conversation store for managing chat history
export interface PlanStep {
  title: string;
  description: string;
  status?: 'pending' | 'running' | 'done' | 'failed';
  summary?: string;
  progressMessage?: string;
  elapsedTime?: number;
}

export interface MessageData {
  type?: 'quote' | 'news' | 'chart' | 'error';
  items?: unknown[];
  [key: string]: unknown;
}

export interface Message {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: Date;
  data?: MessageData;
}

interface ConversationState {
  messages: Message[];
  isLoading: boolean;
  currentPlan: PlanStep[];
  addMessage: (message: Omit<Message, 'id' | 'timestamp'>) => void;
  clearMessages: () => void;
  setLoading: (loading: boolean) => void;
  setPlan: (plan: PlanStep[]) => void;
}

export const useConversation = create<ConversationState>()(
  persist(
    (set) => ({
      messages: [],
      isLoading: false,
      currentPlan: [],
      
      addMessage: (message) => {
        const newMessage: Message = {
          ...message,
          id: `msg-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          timestamp: new Date(),
        };
        set((state) => ({
          messages: [...state.messages, newMessage],
        }));
      },
      
      clearMessages: () => {
        set({ messages: [], currentPlan: [], isLoading: false });
      },
      
      setLoading: (loading) => {
        set({ isLoading: loading });
      },
      
      setPlan: (plan) => {
        set({ currentPlan: plan });
      },
    }),
    {
      name: 'alpha-oracle-conversation',
      partialize: (state) => ({
        messages: state.messages.slice(-50), // Keep only last 50 messages
      }),
    }
  )
);