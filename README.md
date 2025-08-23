# The Alpha Oracle 🔮

An AI-powered financial analysis platform that provides real-time market insights, comprehensive research, and data-driven answers to your financial questions.

## 🌟 Features

### Core Capabilities
- **Intelligent Research Planning**: Automatically generates multi-step research plans tailored to your financial queries
- **Real-Time Market Data**: Access to live stock quotes, market movers, gainers/losers, and sector performance
- **Multi-Source Intelligence**: Aggregates data from multiple sources including:
  - Financial Modeling Prep (FMP) for market data
  - Brave Search for news and web insights
  - OpenRouter for AI-powered analysis
- **Conversational Interface**: Natural language queries with context-aware responses
- **Comprehensive Analysis**: Delivers detailed, data-driven answers with proper citations

### Recent Enhancements (v2.0)
- **Advanced Logging System**: Complete backend logging with request tracking and performance metrics
- **Extended Response Capability**: Support for up to 16,000 tokens (no more truncated responses!)
- **Improved Data Context**: Full market data passed to LLM for richer, more accurate insights
- **Enhanced Prompt Engineering**: 10-section structured prompts for optimal AI responses
- **Robust Error Handling**: HTTP client with timeout protection and retry logic
- **Performance Optimizations**: ~10-15 second end-to-end response time

## 🚀 Getting Started

### Prerequisites
- Node.js 18+ 
- npm or yarn
- API Keys for:
  - [OpenRouter](https://openrouter.ai/) (Required)
  - [Financial Modeling Prep](https://financialmodelingprep.com/) (Optional, for market data)
  - [Brave Search](https://api.search.brave.com/) (Optional, for news/web search)

### Installation

1. Clone the repository:
```bash
git clone https://github.com/yourusername/the-alpha-oracle.git
cd the-alpha-oracle
```

2. Install dependencies:
```bash
npm install
# or
yarn install
```

3. Set up environment variables:
Create a `.env.local` file in the root directory:
```env
# Required
OPENROUTER_API_KEY=sk-or-your-key-here

# Optional (for enhanced features)
FMP_API_KEY=your-fmp-key-here
BRAVE_SEARCH_API_KEY=your-brave-key-here

# Optional configuration
OPENROUTER_MODEL=anthropic/claude-sonnet-4
OPENROUTER_BASE_URL=https://openrouter.ai/api/v1
```

4. Run the development server:
```bash
npm run dev
# or
yarn dev
```

5. Open [http://localhost:3000](http://localhost:3000) in your browser

## 📖 Usage

### Basic Queries
Simply type your financial question in natural language:
- "What are today's market movers?"
- "Show me Tesla's recent performance"
- "What's happening with the Fed and stocks?"
- "Analyze Apple's quarterly earnings"
- "Compare tech sector performance this week"

### Advanced Features

#### Multi-Step Research
The Alpha Oracle automatically breaks down complex queries into research steps:
1. Data gathering (quotes, news, charts)
2. Analysis and synthesis
3. Comprehensive response generation

#### Real-Time Market Data
Access live financial data including:
- Stock quotes and price movements
- Top gainers and losers
- Sector performance metrics
- Market news and sentiment

## 🏗️ Architecture

### Technology Stack
- **Frontend**: Next.js 14, React, TypeScript, Tailwind CSS
- **Backend**: Next.js API Routes, Server-Sent Events (SSE)
- **AI/LLM**: OpenRouter (Claude Sonnet 4)
- **Data Sources**: Financial Modeling Prep, Brave Search
- **Logging**: Custom centralized logger with file output

### Key Components

```
the-alpha-oracle/
├── app/
│   ├── api/
│   │   ├── plan-run/      # Research planning & execution
│   │   └── answer/        # Final answer generation
│   └── page.tsx           # Main UI
├── components/
│   └── chat-interface.tsx # Chat UI component
├── lib/
│   ├── agents/
│   │   ├── planner.ts     # Research plan generation
│   │   ├── executor.ts    # Step execution
│   │   └── summarizer.ts  # Result synthesis
│   ├── services/
│   │   ├── openrouter.ts  # LLM integration
│   │   ├── fmp.ts         # Market data
│   │   └── brave-search.ts # News/web search
│   └── utils/
│       ├── logger.ts      # Centralized logging
│       └── http-client.ts # HTTP with retry logic
└── logs/                  # Application logs
```

### Data Flow
1. **Query Input** → User enters financial question
2. **Plan Generation** → AI creates research plan
3. **Execution** → Parallel data fetching from multiple sources
4. **Synthesis** → AI analyzes and combines results
5. **Response** → Comprehensive answer streamed to user

## 📊 Performance Metrics

- **Plan Generation**: ~3 seconds
- **Data Fetching**: 500-900ms per source
- **Answer Generation**: 5-13 seconds
- **Total Response Time**: 10-15 seconds
- **Max Response Length**: 16,000 tokens

## 🔧 Configuration
### Logging
Logs are automatically saved to `logs/` directory with timestamps:
- Console output with color coding
- File output for debugging
- Request IDs for tracking
- Performance metrics

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

### Development Guidelines
1. Follow TypeScript best practices
2. Add appropriate logging for new features
3. Include error handling for external API calls
4. Update tests for new functionality
5. Document new environment variables

## 🙏 Acknowledgments

- OpenRouter for LLM infrastructure
- Financial Modeling Prep for market data
- Brave Search for web intelligence
- Next.js team for the excellent framework

## 📞 Support

For issues, questions, or suggestions:
- Open an issue on GitHub

---

Built with ❤️ for traders, investors, and financial enthusiasts.
