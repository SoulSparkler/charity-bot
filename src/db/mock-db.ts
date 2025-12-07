/**
 * Mock Database Implementation
 * 
 * Provides a simple in-memory database for development and testing
 * when PostgreSQL is not available or USE_MOCK_DB=true
 */

export interface MockTrade {
  id: string;
  bot: 'A' | 'B';
  pair: string;
  side: 'buy' | 'sell';
  size: number;
  entry_price: number;
  exit_price?: number;
  pnl_usd: number;
  created_at: Date;
}

export interface MockBotState {
  id: string;
  botA_virtual_usd: number;
  botB_virtual_usd: number;
  botA_cycle_number: number;
  botA_cycle_target: number;
  last_reset: Date;
  created_at: Date;
  updated_at: Date;
}

export interface MockSentimentReading {
  id: string;
  fgi_value: number;
  trend_score: number;
  mcs: number;
  created_at: Date;
}

class MockDatabase {
  private trades: MockTrade[] = [];
  private botStates: MockBotState[] = [];
  private sentimentReadings: MockSentimentReading[] = [];
  private monthlyReports: any[] = [];
  private performanceData: any[] = [];
  private configuration: any[] = [];

  constructor() {
    this.initializeDefaultData();
  }

  private initializeDefaultData() {
    // Initialize default bot state
    this.botStates.push({
      id: 'mock-state-1',
      botA_virtual_usd: 230.00,
      botB_virtual_usd: 0.00,
      botA_cycle_number: 1,
      botA_cycle_target: 200.00,
      last_reset: new Date(),
      created_at: new Date(),
      updated_at: new Date()
    });

    // Initialize default sentiment reading
    this.sentimentReadings.push({
      id: 'mock-sentiment-1',
      fgi_value: 50,
      trend_score: 0.0,
      mcs: 0.5,
      created_at: new Date()
    });
  }

  async query(sql: string, params?: any[]): Promise<any> {
    console.log(`🔄 Mock DB Query: ${sql.substring(0, 50)}...`, params);

    try {
      // Handle SELECT queries
      if (sql.trim().toUpperCase().startsWith('SELECT')) {
        return this.handleSelectQuery(sql, params);
      }
      
      // Handle INSERT queries
      if (sql.trim().toUpperCase().startsWith('INSERT')) {
        return this.handleInsertQuery(sql, params);
      }
      
      // Handle UPDATE queries
      if (sql.trim().toUpperCase().startsWith('UPDATE')) {
        return this.handleUpdateQuery(sql, params);
      }
      
      // Handle DELETE queries
      if (sql.trim().toUpperCase().startsWith('DELETE')) {
        return this.handleDeleteQuery(sql, params);
      }

      // Return empty result for other query types
      return { rows: [], rowCount: 0 };
      
    } catch (error) {
      console.error('Mock DB query error:', error);
      return { rows: [], rowCount: 0 };
    }
  }

  private handleSelectQuery(sql: string, params?: any[]): any {
    // Parse basic SELECT queries
    if (sql.includes('FROM bot_state')) {
      return { rows: this.botStates, rowCount: this.botStates.length };
    }
    
    if (sql.includes('FROM sentiment_readings')) {
      if (sql.includes('ORDER BY created_at DESC') && sql.includes('LIMIT 1')) {
        const latest = this.sentimentReadings.length > 0 ? 
          [this.sentimentReadings[this.sentimentReadings.length - 1]] : [];
        return { rows: latest, rowCount: latest.length };
      }
      return { rows: this.sentimentReadings, rowCount: this.sentimentReadings.length };
    }
    
    if (sql.includes('FROM trade_logs')) {
      let filteredTrades = [...this.trades];
      
      // Apply WHERE conditions
      if (sql.includes('WHERE bot =')) {
        const botMatch = sql.match(/bot = ['"]([AB])['"]/);
        if (botMatch) {
          filteredTrades = filteredTrades.filter(trade => trade.bot === botMatch[1]);
        }
      }
      
      if (sql.includes('AND created_at >= NOW()')) {
        const daysMatch = sql.match(/INTERVAL '(\d+) days'/);
        if (daysMatch) {
          const days = parseInt(daysMatch[1]);
          const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
          filteredTrades = filteredTrades.filter(trade => trade.created_at >= cutoff);
        }
      }
      
      if (sql.includes('ORDER BY created_at DESC') && sql.includes('LIMIT')) {
        const limitMatch = sql.match(/LIMIT (\d+)/);
        if (limitMatch) {
          const limit = parseInt(limitMatch[1]);
          filteredTrades = filteredTrades.slice(0, limit);
        }
      }
      
      return { rows: filteredTrades, rowCount: filteredTrades.length };
    }
    
    if (sql.includes('FROM monthly_reports')) {
      return { rows: this.monthlyReports, rowCount: this.monthlyReports.length };
    }
    
    if (sql.includes('FROM configuration')) {
      return { rows: this.configuration, rowCount: this.configuration.length };
    }

    // Aggregate queries
    if (sql.includes('COUNT(*)') && sql.includes('trade_logs')) {
      const botMatch = sql.match(/bot = ['"]([AB])['"]/);
      const count = botMatch ? 
        this.trades.filter(trade => trade.bot === botMatch[1]).length :
        this.trades.length;
      return { rows: [{ count: count.toString() }], rowCount: 1 };
    }

    if (sql.includes('SUM(pnl_usd)') && sql.includes('trade_logs')) {
      const botMatch = sql.match(/bot = ['"]([AB])['"]/);
      const sum = botMatch ? 
        this.trades.filter(trade => trade.bot === botMatch[1])
          .reduce((acc, trade) => acc + trade.pnl_usd, 0) :
        this.trades.reduce((acc, trade) => acc + trade.pnl_usd, 0);
      return { rows: [{ sum: sum.toString() }], rowCount: 1 };
    }

    return { rows: [], rowCount: 0 };
  }

  private handleInsertQuery(sql: string, params?: any[]): any {
    if (sql.includes('INSERT INTO trade_logs')) {
      const trade: MockTrade = {
        id: `mock-trade-${Date.now()}`,
        bot: params[0],
        pair: params[1],
        side: params[2],
        size: params[3],
        entry_price: params[4],
        exit_price: params[5],
        pnl_usd: params[6],
        created_at: new Date()
      };
      this.trades.push(trade);
      return { rows: [trade], rowCount: 1 };
    }

    if (sql.includes('INSERT INTO bot_state')) {
      const state: MockBotState = {
        id: `mock-state-${Date.now()}`,
        botA_virtual_usd: params[0] || 230.00,
        botB_virtual_usd: params[1] || 0.00,
        botA_cycle_number: params[2] || 1,
        botA_cycle_target: params[3] || 200.00,
        last_reset: new Date(),
        created_at: new Date(),
        updated_at: new Date()
      };
      this.botStates.push(state);
      return { rows: [state], rowCount: 1 };
    }

    if (sql.includes('INSERT INTO sentiment_readings')) {
      const reading: MockSentimentReading = {
        id: `mock-sentiment-${Date.now()}`,
        fgi_value: params[0],
        trend_score: params[1],
        mcs: params[2],
        created_at: new Date()
      };
      this.sentimentReadings.push(reading);
      return { rows: [reading], rowCount: 1 };
    }

    return { rows: [], rowCount: 0 };
  }

  private handleUpdateQuery(sql: string, params?: any[]): any {
    if (sql.includes('UPDATE bot_state')) {
      if (sql.includes('botA_virtual_usd = botA_virtual_usd +')) {
        const pnl = params[0];
        const stateId = params[1];
        const state = this.botStates.find(s => s.id === stateId);
        if (state) {
          state.botA_virtual_usd += pnl;
          state.updated_at = new Date();
          return { rows: [state], rowCount: 1 };
        }
      }
      
      if (sql.includes('botB_virtual_usd = botB_virtual_usd +')) {
        const pnl = params[0];
        const stateId = params[1];
        const state = this.botStates.find(s => s.id === stateId);
        if (state) {
          state.botB_virtual_usd += pnl;
          state.updated_at = new Date();
          return { rows: [state], rowCount: 1 };
        }
      }
    }
    
    return { rows: [], rowCount: 0 };
  }

  private handleDeleteQuery(sql: string, params?: any[]): any {
    // Mock DELETE operations
    return { rows: [], rowCount: 0 };
  }
}

// Export singleton instance
const mockDatabase = new MockDatabase();

// Export the functions that match the PostgreSQL interface
export const mockQuery = mockDatabase.query.bind(mockDatabase);

export async function testConnection(): Promise<boolean> {
  console.log('✅ Mock database connection successful');
  return true;
}

export async function initializeDatabase(): Promise<void> {
  console.log('✅ Mock database initialized');
  return Promise.resolve();
}

export async function closeDatabase(): Promise<void> {
  console.log('✅ Mock database connection closed');
  return Promise.resolve();
}

export async function healthCheck(): Promise<{ status: string; timestamp: string }> {
  return {
    status: 'healthy',
    timestamp: new Date().toISOString()
  };
}

export default mockDatabase;