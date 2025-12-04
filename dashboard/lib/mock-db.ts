// Mock Database Implementation for Dashboard Development
// This provides in-memory data storage when PostgreSQL is not available

export interface MockData {
  bot_state: {
    botA_virtual_usd: number;
    botB_virtual_usd: number;
    botA_cycle_number: number;
    botA_cycle_target: number;
    last_reset: string;
    created_at: string;
    updated_at: string;
  };
  sentiment_readings: Array<{
    id: string;
    fgi_value: number;
    trend_score: number;
    mcs: number;
    created_at: string;
  }>;
  trade_logs: Array<{
    id: string;
    bot: string;
    pair: string;
    side: string;
    size: number;
    entry_price: number;
    exit_price: number;
    pnl_usd: number;
    created_at: string;
  }>;
  monthly_reports: Array<{
    id: string;
    month: string;
    botB_start_balance: number;
    botB_end_balance: number;
    donation_amount: number;
    created_at: string;
  }>;
}

// Initialize mock data with realistic demo data
let mockData: MockData = {
  bot_state: {
    botA_virtual_usd: 265.40,
    botB_virtual_usd: 125.50,
    botA_cycle_number: 2,
    botA_cycle_target: 230.00,
    last_reset: new Date(Date.now() - 86400000).toISOString(), // 1 day ago
    created_at: new Date(Date.now() - 86400000 * 30).toISOString(), // 30 days ago
    updated_at: new Date().toISOString(),
  },
  sentiment_readings: [
    {
      id: '1',
      fgi_value: 52,
      trend_score: 0.15,
      mcs: 0.72,
      created_at: new Date().toISOString(),
    },
    {
      id: '2',
      fgi_value: 48,
      trend_score: -0.08,
      mcs: 0.65,
      created_at: new Date(Date.now() - 900000).toISOString(), // 15 minutes ago
    },
    {
      id: '3',
      fgi_value: 55,
      trend_score: 0.22,
      mcs: 0.78,
      created_at: new Date(Date.now() - 1800000).toISOString(), // 30 minutes ago
    }
  ],
  trade_logs: [
    {
      id: '1',
      bot: 'A',
      pair: 'BTC/USD',
      side: 'buy',
      size: 0.0085,
      entry_price: 42850,
      exit_price: 44200,
      pnl_usd: 11.48,
      created_at: new Date(Date.now() - 1800000).toISOString(), // 30 minutes ago
    },
    {
      id: '2',
      bot: 'A',
      pair: 'ETH/USD',
      side: 'buy',
      size: 0.42,
      entry_price: 2580,
      exit_price: 2690,
      pnl_usd: 46.20,
      created_at: new Date(Date.now() - 3600000).toISOString(), // 1 hour ago
    },
    {
      id: '3',
      bot: 'B',
      pair: 'BTC/USD',
      side: 'sell',
      size: 0.0032,
      entry_price: 43100,
      exit_price: 42850,
      pnl_usd: 0.80,
      created_at: new Date(Date.now() - 2700000).toISOString(), // 45 minutes ago
    },
    {
      id: '4',
      bot: 'A',
      pair: 'ETH/USD',
      side: 'sell',
      size: 0.25,
      entry_price: 2650,
      exit_price: 2620,
      pnl_usd: -7.50,
      created_at: new Date(Date.now() - 5400000).toISOString(), // 1.5 hours ago
    },
    {
      id: '5',
      bot: 'B',
      pair: 'BTC/USD',
      side: 'buy',
      size: 0.0018,
      entry_price: 42650,
      exit_price: 43100,
      pnl_usd: 0.81,
      created_at: new Date(Date.now() - 7200000).toISOString(), // 2 hours ago
    }
  ],
  monthly_reports: [
    {
      id: '1',
      month: '2024-12',
      botB_start_balance: 0,
      botB_end_balance: 125.50,
      donation_amount: 62.75,
      created_at: new Date().toISOString(),
    },
    {
      id: '2',
      month: '2024-11',
      botB_start_balance: 0,
      botB_end_balance: 89.30,
      donation_amount: 44.65,
      created_at: new Date(Date.now() - 2592000000).toISOString(), // 30 days ago
    }
  ]
};

// Mock query function
export async function mockQuery(text: string, params?: any[]): Promise<any> {
  const query = text.toLowerCase().trim();
  
  // Bot state queries
  if (query.includes('bot_state') && query.includes('select')) {
    if (query.includes('order by created_at desc limit 1')) {
      return {
        rows: [mockData.bot_state],
        rowCount: 1
      };
    }
  }
  
  // Sentiment queries
  if (query.includes('sentiment_readings')) {
    if (query.includes('order by created_at desc limit 1')) {
      const latest = mockData.sentiment_readings[0];
      return {
        rows: [latest],
        rowCount: 1
      };
    }
    if (query.includes('order by created_at desc limit')) {
      const limit = params?.[0] || 30;
      return {
        rows: mockData.sentiment_readings.slice(0, limit),
        rowCount: mockData.sentiment_readings.length
      };
    }
  }
  
  // Trade logs queries
  if (query.includes('trade_logs')) {
    if (query.includes('where bot = \'a\'')) {
      const limit = params?.[0] || 10;
      const botATrades = mockData.trade_logs.filter(trade => trade.bot === 'A').slice(0, limit);
      return {
        rows: botATrades,
        rowCount: botATrades.length
      };
    }
    if (query.includes('where bot = \'b\'')) {
      const limit = params?.[0] || 10;
      const botBTrades = mockData.trade_logs.filter(trade => trade.bot === 'B').slice(0, limit);
      return {
        rows: botBTrades,
        rowCount: botBTrades.length
      };
    }
    if (query.includes('count(*)')) {
      const count = mockData.trade_logs.filter(trade => {
        const today = new Date().toDateString();
        const tradeDate = new Date(trade.created_at).toDateString();
        return today === tradeDate && (!trade.exit_price || trade.exit_price === 0);
      }).length;
      return {
        rows: [{ count: count.toString() }],
        rowCount: 1
      };
    }
  }
  
  // Monthly reports
  if (query.includes('monthly_reports')) {
    const limit = params?.[0] || 12;
    return {
      rows: mockData.monthly_reports.slice(0, limit),
      rowCount: mockData.monthly_reports.length
    };
  }
  
  // Statistics queries
  if (query.includes('avg(case when pnl_usd > 0 then 1.0 else 0.0 end)')) {
    const bot = query.includes('bot = \'a\'') ? 'A' : 'B';
    const botTrades = mockData.trade_logs.filter(trade => trade.bot === bot);
    const winningTrades = botTrades.filter(trade => trade.pnl_usd > 0);
    const winRate = botTrades.length > 0 ? winningTrades.length / botTrades.length : 0;
    const totalPnl = botTrades.reduce((sum, trade) => sum + trade.pnl_usd, 0);
    const avgTradeSize = botTrades.length > 0 
      ? botTrades.reduce((sum, trade) => sum + (trade.size * trade.entry_price), 0) / botTrades.length 
      : 0;
    
    return {
      rows: [{
        total_trades: botTrades.length.toString(),
        win_rate: winRate.toString(),
        total_pnl: totalPnl.toString(),
        avg_trade_size: avgTradeSize.toString(),
      }],
      rowCount: 1
    };
  }
  
  // Month-to-date P&L
  if (query.includes('sum(pnl_usd) as mtd_pnl') && query.includes('bot = \'b\'')) {
    const botBTrades = mockData.trade_logs.filter(trade => trade.bot === 'B');
    const mtdPnl = botBTrades.reduce((sum, trade) => sum + trade.pnl_usd, 0);
    return {
      rows: [{ mtd_pnl: mtdPnl.toString() }],
      rowCount: 1
    };
  }
  
  // Simple timestamp query
  if (query.includes('select now()') || query.includes('select now as timestamp')) {
    return {
      rows: [{ now: new Date(), timestamp: new Date().toISOString() }],
      rowCount: 1
    };
  }
  
  // Default empty result
  return { rows: [], rowCount: 0 };
}

// Test connection function
export async function testConnection(): Promise<boolean> {
  console.log('✅ Mock database connection successful');
  return true;
}