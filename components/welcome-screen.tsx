'use client';

import React from 'react';
import { TrendingUp, Sparkles, Users, BarChart3, Search, Brain, ArrowRight, BookOpen, Target, Zap } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface WelcomeScreenProps {
  onGetStarted: () => void;
}

export function WelcomeScreen({ onGetStarted }: WelcomeScreenProps) {
  const userTypes = [
    {
      icon: BookOpen,
      title: "Complete Beginner",
      description: "New to investing? Start with basic questions like 'What is a stock?' or 'How do I start investing?'",
      examples: [
        "What is the stock market?",
        "How do I choose my first stock?",
        "What's the difference between stocks and bonds?"
      ],
      color: "from-green-500 to-emerald-600"
    },
    {
      icon: Target,
      title: "Casual Investor",
      description: "Building your portfolio? Ask about specific companies, market trends, or investment strategies.",
      examples: [
        "Should I invest in Apple right now?",
        "What are the best dividend stocks?",
        "How is the tech sector performing?"
      ],
      color: "from-blue-500 to-cyan-600"
    },
    {
      icon: Zap,
      title: "Active Trader",
      description: "Looking for detailed analysis? Get real-time data, technical analysis, and market insights.",
      examples: [
        "Show me NVDA's technical indicators",
        "What are today's biggest movers?",
        "Analyze Tesla's recent earnings impact"
      ],
      color: "from-purple-500 to-violet-600"
    }
  ];

  const features = [
    {
      icon: Search,
      title: "Real-Time Research",
      description: "Get up-to-date market data, news, and financial information from multiple sources"
    },
    {
      icon: Brain,
      title: "AI-Powered Analysis",
      description: "Advanced AI analyzes complex financial data and provides clear, actionable insights"
    },
    {
      icon: BarChart3,
      title: "Comprehensive Reports",
      description: "Detailed research reports with charts, trends, and professional-grade analysis"
    },
    {
      icon: TrendingUp,
      title: "Market Intelligence",
      description: "Stay ahead with market trends, sector analysis, and investment opportunities"
    }
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-100 dark:from-slate-900 dark:via-slate-800 dark:to-slate-900">
      <div className="container mx-auto px-6 py-12">
        {/* Header */}
        <div className="text-center mb-16">
          <div className="flex items-center justify-center gap-3 mb-6">
            <div className="p-3 rounded-2xl bg-gradient-to-br from-blue-500 to-purple-600 shadow-lg">
              <TrendingUp className="h-8 w-8 text-white" />
            </div>
            <h1 className="text-4xl md:text-5xl font-bold bg-gradient-to-r from-blue-600 via-purple-600 to-indigo-600 bg-clip-text text-transparent">
              The Alpha Oracle
            </h1>
          </div>
          <p className="text-xl text-gray-600 dark:text-gray-300 max-w-3xl mx-auto leading-relaxed">
            Your AI-powered financial research assistant that transforms complex market data into clear, actionable insights. 
            Whether you&apos;re a complete beginner or an experienced trader, get the information you need to make informed decisions.
          </p>
        </div>

        {/* Features Grid */}
        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6 mb-16">
          {features.map((feature, index) => (
            <div key={index} className="bg-white/70 dark:bg-slate-800/70 backdrop-blur-sm rounded-xl p-6 shadow-lg border border-white/20 dark:border-slate-700/50">
              <div className="p-2 rounded-lg bg-gradient-to-br from-blue-500 to-purple-600 w-fit mb-4">
                <feature.icon className="h-5 w-5 text-white" />
              </div>
              <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-2">{feature.title}</h3>
              <p className="text-sm text-gray-600 dark:text-gray-400 leading-relaxed">{feature.description}</p>
            </div>
          ))}
        </div>

        {/* User Types */}
        <div className="mb-16">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold text-gray-900 dark:text-gray-100 mb-4">
              Perfect for Every Level
            </h2>
            <p className="text-gray-600 dark:text-gray-300 max-w-2xl mx-auto">
              No matter your experience level, The Alpha Oracle adapts to your needs and provides relevant insights.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-8">
            {userTypes.map((type, index) => (
              <div key={index} className="bg-white/80 dark:bg-slate-800/80 backdrop-blur-sm rounded-2xl p-8 shadow-xl border border-white/30 dark:border-slate-700/50">
                <div className={cn(
                  "p-3 rounded-xl bg-gradient-to-br w-fit mb-6 shadow-lg",
                  type.color
                )}>
                  <type.icon className="h-6 w-6 text-white" />
                </div>
                
                <h3 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-3">
                  {type.title}
                </h3>
                
                <p className="text-gray-600 dark:text-gray-400 mb-6 leading-relaxed">
                  {type.description}
                </p>
                
                <div className="space-y-3">
                  <h4 className="font-semibold text-gray-800 dark:text-gray-200 text-sm">Try asking:</h4>
                  {type.examples.map((example, exampleIndex) => (
                    <div key={exampleIndex} className="flex items-start gap-2">
                      <div className="w-1.5 h-1.5 rounded-full bg-gradient-to-r from-blue-500 to-purple-600 mt-2 flex-shrink-0" />
                      <p className="text-sm text-gray-600 dark:text-gray-400 italic">&ldquo;{example}&rdquo;</p>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* How It Works */}
        <div className="bg-white/60 dark:bg-slate-800/60 backdrop-blur-sm rounded-2xl p-8 md:p-12 shadow-xl border border-white/30 dark:border-slate-700/50 mb-16">
          <div className="text-center mb-10">
            <h2 className="text-3xl font-bold text-gray-900 dark:text-gray-100 mb-4">
              How It Works
            </h2>
            <p className="text-gray-600 dark:text-gray-300 max-w-2xl mx-auto">
              Our AI research process ensures you get comprehensive, accurate, and up-to-date information.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-8">
            <div className="text-center">
              <div className="w-16 h-16 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center mx-auto mb-4 shadow-lg">
                <span className="text-white font-bold text-xl">1</span>
              </div>
              <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-2">Ask Your Question</h3>
              <p className="text-gray-600 dark:text-gray-400 text-sm">
                Type any financial question in natural language - no complex queries needed.
              </p>
            </div>

            <div className="text-center">
              <div className="w-16 h-16 rounded-full bg-gradient-to-br from-purple-500 to-indigo-600 flex items-center justify-center mx-auto mb-4 shadow-lg">
                <span className="text-white font-bold text-xl">2</span>
              </div>
              <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-2">AI Research</h3>
              <p className="text-gray-600 dark:text-gray-400 text-sm">
                Our AI creates a research plan and gathers data from multiple financial sources.
              </p>
            </div>

            <div className="text-center">
              <div className="w-16 h-16 rounded-full bg-gradient-to-br from-indigo-500 to-cyan-600 flex items-center justify-center mx-auto mb-4 shadow-lg">
                <span className="text-white font-bold text-xl">3</span>
              </div>
              <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-2">Get Insights</h3>
              <p className="text-gray-600 dark:text-gray-400 text-sm">
                Receive clear, actionable insights with charts, analysis, and recommendations.
              </p>
            </div>
          </div>
        </div>

        {/* CTA */}
        <div className="text-center">
          <div className="bg-gradient-to-r from-blue-600 via-purple-600 to-indigo-600 rounded-2xl p-8 md:p-12 shadow-2xl">
            <div className="flex items-center justify-center gap-2 mb-4">
              <Sparkles className="h-6 w-6 text-white" />
              <h2 className="text-2xl md:text-3xl font-bold text-white">
                Ready to Start Your Financial Journey?
              </h2>
            </div>
            <p className="text-blue-100 mb-8 max-w-2xl mx-auto text-lg">
              Join thousands of investors who trust The Alpha Oracle for their financial research needs.
            </p>
            <Button
              onClick={onGetStarted}
              size="lg"
              className="bg-white text-blue-600 hover:bg-blue-50 font-semibold px-8 py-3 rounded-xl shadow-lg transition-all duration-200 hover:shadow-xl hover:scale-105"
            >
              Get Started Now
              <ArrowRight className="ml-2 h-5 w-5" />
            </Button>
          </div>
        </div>

        {/* Footer */}
        <div className="text-center mt-12 pt-8 border-t border-gray-200 dark:border-gray-700">
          <p className="text-gray-500 dark:text-gray-400 text-sm">
            Powered by advanced AI • Real-time market data • Professional-grade analysis
          </p>
        </div>
      </div>
    </div>
  );
}