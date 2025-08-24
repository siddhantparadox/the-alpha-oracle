'use client';

import React, { useState } from 'react';
import { HelpCircle, ChevronDown, ChevronRight, Sparkles, Users, Bell, Shield, TrendingUp, Zap } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';

interface FAQItem {
  question: string;
  answer: string;
  category: 'general' | 'usage' | 'technical' | 'future';
}

interface FutureFeature {
  icon: React.ElementType;
  title: string;
  description: string;
  status: 'planned' | 'development' | 'research';
  color: string;
}

export function FAQModal() {
  const [openItems, setOpenItems] = useState<number[]>([]);
  const [activeTab, setActiveTab] = useState<'faq' | 'future'>('faq');

  const toggleItem = (index: number) => {
    setOpenItems(prev => 
      prev.includes(index) 
        ? prev.filter(i => i !== index)
        : [...prev, index]
    );
  };

  const faqs: FAQItem[] = [
    {
      category: 'general',
      question: 'What is The Alpha Oracle?',
      answer: 'The Alpha Oracle is an AI-powered financial research assistant that provides real-time market data, analysis, and insights. It helps investors of all levels make informed decisions by gathering and analyzing information from multiple financial sources.'
    },
    {
      category: 'general',
      question: 'Who can use The Alpha Oracle?',
      answer: 'Anyone interested in financial markets! Whether you&apos;re a complete beginner learning about investing, a casual investor building your portfolio, or an active trader seeking detailed analysis, The Alpha Oracle adapts to your knowledge level.'
    },
    {
      category: 'usage',
      question: 'What kind of questions can I ask?',
      answer: 'You can ask about specific stocks (e.g., "How is Apple performing?"), market trends ("What are today&apos;s biggest movers?"), investment strategies ("Best dividend stocks?"), company analysis, earnings reports, and general financial education questions.'
    },
    {
      category: 'usage',
      question: 'How accurate is the information?',
      answer: 'The Alpha Oracle uses real-time data from reputable financial sources and advanced AI analysis. However, all information is for educational purposes only and should not be considered as financial advice. Always do your own research and consult with financial professionals.'
    },
    {
      category: 'technical',
      question: 'Do I need an API key?',
      answer: 'Yes, you need an OpenRouter API key to use The Alpha Oracle. This allows the AI to process your requests and provide personalized responses. You can get one from OpenRouter and add it in the Settings.'
    },
    {
      category: 'technical',
      question: 'Is my data stored?',
      answer: 'Currently, your conversation history is stored locally in your browser for the session. We&apos;re working on user authentication features that will allow you to securely store and sync your conversations across devices.'
    },
    {
      category: 'usage',
      question: 'Can I get real-time stock prices?',
      answer: 'Yes! The Alpha Oracle can provide real-time stock quotes, market data, and live updates on stock performance, trading volumes, and price movements throughout the trading day.'
    },
    {
      category: 'technical',
      question: 'What happens when I click Clear?',
      answer: 'The Clear button removes all messages, research plans, and resets the entire conversation context, giving you a completely fresh start. Your API key and settings are preserved.'
    }
  ];

  const futureFeatures: FutureFeature[] = [
    {
      icon: Users,
      title: 'User Authentication',
      description: 'Secure user accounts to save your conversation history, preferences, and personalized insights across devices.',
      status: 'planned',
      color: 'from-blue-500 to-cyan-600'
    },
    {
      icon: Bell,
      title: 'Stock Alerts & Reminders',
      description: 'Set up custom alerts for price movements, earnings dates, and other important events for your watched stocks.',
      status: 'planned',
      color: 'from-orange-500 to-red-600'
    },
    {
      icon: TrendingUp,
      title: 'Portfolio Tracking',
      description: 'Track your investment portfolio performance with detailed analytics, profit/loss calculations, and rebalancing suggestions.',
      status: 'development',
      color: 'from-green-500 to-emerald-600'
    },
    {
      icon: Sparkles,
      title: 'Advanced AI Models',
      description: 'Integration with specialized financial AI models for more sophisticated analysis and predictions.',
      status: 'research',
      color: 'from-purple-500 to-violet-600'
    },
    {
      icon: Shield,
      title: 'Data Privacy Controls',
      description: 'Enhanced privacy controls allowing you to manage what data is stored and how it&apos;s used for personalization.',
      status: 'planned',
      color: 'from-gray-500 to-slate-600'
    },
    {
      icon: Zap,
      title: 'Real-time Collaboration',
      description: 'Share research sessions and collaborate with other investors in real-time for group analysis.',
      status: 'research',
      color: 'from-indigo-500 to-blue-600'
    }
  ];

  const getStatusBadge = (status: string) => {
    const styles = {
      planned: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300',
      development: 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300',
      research: 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300'
    };
    
    return (
      <span className={cn('px-2 py-1 rounded-full text-xs font-medium', styles[status as keyof typeof styles])}>
        {status.charAt(0).toUpperCase() + status.slice(1)}
      </span>
    );
  };

  const categories = [
    { id: 'general', name: 'General', count: faqs.filter(f => f.category === 'general').length },
    { id: 'usage', name: 'Usage', count: faqs.filter(f => f.category === 'usage').length },
    { id: 'technical', name: 'Technical', count: faqs.filter(f => f.category === 'technical').length }
  ];

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm">
          <HelpCircle className="h-4 w-4 mr-1" />
          FAQ
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-4xl max-h-[80vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <HelpCircle className="h-5 w-5" />
            Help & Future Plans
          </DialogTitle>
        </DialogHeader>
        
        {/* Tab Navigation */}
        <div className="flex border-b">
          <button
            onClick={() => setActiveTab('faq')}
            className={cn(
              'px-4 py-2 font-medium text-sm border-b-2 transition-colors',
              activeTab === 'faq'
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            )}
          >
            Frequently Asked Questions
          </button>
          <button
            onClick={() => setActiveTab('future')}
            className={cn(
              'px-4 py-2 font-medium text-sm border-b-2 transition-colors',
              activeTab === 'future'
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            )}
          >
            Future Features
          </button>
        </div>

        <ScrollArea className="h-[500px] pr-4">
          {activeTab === 'faq' ? (
            <div className="space-y-6">
              {/* Category Overview */}
              <div className="grid grid-cols-3 gap-4">
                {categories.map((category) => (
                  <div key={category.id} className="text-center p-3 bg-muted/50 rounded-lg">
                    <div className="font-semibold text-lg">{category.count}</div>
                    <div className="text-sm text-muted-foreground">{category.name}</div>
                  </div>
                ))}
              </div>

              {/* FAQ Items */}
              <div className="space-y-3">
                {faqs.map((faq, index) => (
                  <div key={index} className="border rounded-lg overflow-hidden">
                    <button
                      onClick={() => toggleItem(index)}
                      className="w-full px-4 py-3 text-left flex items-center justify-between hover:bg-muted/50 transition-colors"
                    >
                      <span className="font-medium pr-4">{faq.question}</span>
                      {openItems.includes(index) ? (
                        <ChevronDown className="h-4 w-4 flex-shrink-0" />
                      ) : (
                        <ChevronRight className="h-4 w-4 flex-shrink-0" />
                      )}
                    </button>
                    {openItems.includes(index) && (
                      <div className="px-4 pb-4 text-muted-foreground leading-relaxed">
                        {faq.answer}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="space-y-6">
              <div className="text-center mb-8">
                <h3 className="text-xl font-semibold mb-2">Coming Soon</h3>
                <p className="text-muted-foreground">
                  We&apos;re constantly working to improve The Alpha Oracle. Here&apos;s what&apos;s on our roadmap:
                </p>
              </div>

              <div className="grid gap-6">
                {futureFeatures.map((feature, index) => (
                  <div key={index} className="flex gap-4 p-4 border rounded-lg hover:shadow-md transition-shadow">
                    <div className={cn(
                      'p-3 rounded-xl bg-gradient-to-br flex-shrink-0',
                      feature.color
                    )}>
                      <feature.icon className="h-6 w-6 text-white" />
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <h4 className="font-semibold">{feature.title}</h4>
                        {getStatusBadge(feature.status)}
                      </div>
                      <p className="text-muted-foreground text-sm leading-relaxed">
                        {feature.description}
                      </p>
                    </div>
                  </div>
                ))}
              </div>

              <div className="mt-8 p-4 bg-gradient-to-r from-blue-50 to-purple-50 dark:from-blue-950/20 dark:to-purple-950/20 rounded-lg border">
                <h4 className="font-semibold mb-2">Have a Feature Request?</h4>
                <p className="text-sm text-muted-foreground">
                  We&apos;d love to hear your ideas! The Alpha Oracle is built for the community, and your feedback helps shape our development priorities.
                </p>
              </div>
            </div>
          )}
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}