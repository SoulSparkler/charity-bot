'use client';

import { useState, useEffect } from 'react';

interface BotATrade {
  pair: string;
  side: 'buy' | 'sell';
  size: number;
  entry_price: number;
  exit_price: number;
  pnl_usd: number;
  created_at: string;
}

interface BotAData {
  current_balance: number;
  cycle_number: number;
  cycle_target: number;
  cycle_progress: number;
  risk_mode: string;
  today_trades: number;
  win_rate: number;
  total_pnl_today: number;
  trades: BotATrade[];
  sentiment: {
    mcs: number;
    risk_level: string;
  };
  last_updated: string;
}

export default function BotAPage() {
  const [data, setData] = useState<BotAData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchBotAData();
    
    // Set up auto-refresh
    const interval = setInterval(fetchBotAData, 30000); // 30 seconds
    return () => clearInterval(interval);
  }, []);

  const fetchBotAData = async () => {
    try {
      const response = await fetch('/api/dashboard/bot-a');
      if (response.ok) {
        const botData = await response.json();
        setData(botData);
      }
    } catch (error) {
      console.error('Failed to fetch Bot A data:', error);
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value);
  };

  const formatPercentage = (value: number) => {
    return `${(value * 100).toFixed(1)}%`;
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString();
  };

  const getPnLColor = (pnl: number) => {
    return pnl >= 0 ? 'text-green-400' : 'text-red-400';
  };

  const getSideColor = (side: string) => {
    return side === 'buy' ? 'text-green-400' : 'text-red-400';
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="text-center">
          <h1 className="text-3xl font-bold text-white mb-2">Bot A - Aggressive Growth Engine</h1>
          <div className="h-4 bg-gray-700 rounded w-64 mx-auto animate-pulse"></div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="rounded-lg p-6 bg-gray-800 border border-gray-700 animate-pulse">
              <div className="h-4 bg-gray-700 rounded mb-4"></div>
              <div className="h-8 bg-gray-700 rounded"></div>
            </div>
          ))}
        </div>
        <div className="rounded-lg p-6 bg-gray-800 border border-gray-700">
          <div className="h-6 bg-gray-700 rounded mb-4"></div>
          <div className="space-y-3">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="h-12 bg-gray-700 rounded"></div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-400 text-lg">Failed to load Bot A data</p>
        <button 
          onClick={fetchBotAData}
          className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-white">Bot A - Aggressive Growth Engine</h1>
          <p className="text-gray-400 mt-2">
            Focused on rapid balance growth through aggressive trading strategies
          </p>
        </div>
        <button
          onClick={fetchBotAData}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
        >
          🔄 Refresh
        </button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="rounded-lg p-6 bg-gray-800 border border-gray-700">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-gray-400 text-sm font-medium uppercase tracking-wide">Current Balance</p>
              <p className="text-2xl font-bold text-white mt-2">{formatCurrency(data.current_balance)}</p>
            </div>
            <div className="text-3xl">💰</div>
          </div>
        </div>

        <div className="rounded-lg p-6 bg-gray-800 border border-gray-700">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-gray-400 text-sm font-medium uppercase tracking-wide">Cycle Progress</p>
              <p className="text-2xl font-bold text-white mt-2">
                {formatCurrency(data.cycle_target)} Target
              </p>
              <p className="text-sm text-gray-400 mt-1">
                {data.cycle_progress.toFixed(1)}% Complete
              </p>
            </div>
            <div className="text-3xl">🎯</div>
          </div>
        </div>

        <div className="rounded-lg p-6 bg-gray-800 border border-gray-700">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-gray-400 text-sm font-medium uppercase tracking-wide">Today's P&L</p>
              <p className={`text-2xl font-bold mt-2 ${getPnLColor(data.total_pnl_today)}`}>
                {formatCurrency(data.total_pnl_today)}
              </p>
              <p className="text-sm text-gray-400 mt-1">
                {data.today_trades} trades today
              </p>
            </div>
            <div className={`text-3xl ${data.total_pnl_today >= 0 ? '📈' : '📉'}`}></div>
          </div>
        </div>

        <div className="rounded-lg p-6 bg-gray-800 border border-gray-700">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-gray-400 text-sm font-medium uppercase tracking-wide">Win Rate</p>
              <p className={`text-2xl font-bold mt-2 ${data.win_rate >= 0.5 ? 'text-green-400' : 'text-red-400'}`}>
                {formatPercentage(data.win_rate)}
              </p>
              <p className="text-sm text-gray-400 mt-1">
                {data.risk_mode} Risk Mode
              </p>
            </div>
            <div className="text-3xl">📊</div>
          </div>
        </div>
      </div>

      {/* Cycle Progress Bar */}
      <div className="rounded-lg p-6 bg-gray-800 border border-gray-700">
        <h3 className="text-lg font-semibold text-white mb-4">Cycle {data.cycle_number} Progress</h3>
        <div className="space-y-3">
          <div className="flex justify-between text-sm">
            <span className="text-gray-400">Current Balance</span>
            <span className="text-white font-medium">{formatCurrency(data.current_balance)}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-gray-400">Cycle Target</span>
            <span className="text-white font-medium">{formatCurrency(data.cycle_target)}</span>
          </div>
          <div className="w-full bg-gray-700 rounded-full h-4">
            <div 
              className="bg-gradient-to-r from-blue-500 to-green-500 h-4 rounded-full transition-all duration-500 flex items-center justify-end pr-2"
              style={{ 
                width: `${Math.min(data.cycle_progress, 100)}%` 
              }}
            >
              {data.cycle_progress > 15 && (
                <span className="text-white text-xs font-medium">
                  {data.cycle_progress.toFixed(1)}%
                </span>
              )}
            </div>
          </div>
          <div className="flex justify-between text-xs">
            <span className="text-gray-400">
              ${formatCurrency(data.cycle_target - data.current_balance)} remaining
            </span>
            <span className="text-gray-400">
              {data.current_balance >= data.cycle_target ? '✅ Target Reached! Transferring to Bot B...' : '🎯 In Progress'}
            </span>
          </div>
        </div>
      </div>

      {/* Risk & Sentiment Info */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="rounded-lg p-6 bg-gray-800 border border-gray-700">
          <h3 className="text-lg font-semibold text-white mb-4">Risk Assessment</h3>
          <div className="space-y-3">
            <div className="flex justify-between">
              <span className="text-gray-400">Current Risk Mode</span>
              <span className={`font-medium ${
                data.risk_mode === 'High' ? 'text-red-400' : 
                data.risk_mode === 'Medium' ? 'text-yellow-400' : 'text-green-400'
              }`}>
                {data.risk_mode}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">Market Confidence Score</span>
              <span className="text-white font-medium">{data.sentiment.mcs.toFixed(3)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">Risk Level</span>
              <span className="text-white font-medium">{data.sentiment.risk_level}</span>
            </div>
          </div>
        </div>

        <div className="rounded-lg p-6 bg-gray-800 border border-gray-700">
          <h3 className="text-lg font-semibold text-white mb-4">Performance Summary</h3>
          <div className="space-y-3">
            <div className="flex justify-between">
              <span className="text-gray-400">Today's Trades</span>
              <span className="text-white font-medium">{data.today_trades}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">Win Rate Today</span>
              <span className={`font-medium ${data.win_rate >= 0.5 ? 'text-green-400' : 'text-red-400'}`}>
                {formatPercentage(data.win_rate)}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">Today's P&L</span>
              <span className={`font-medium ${getPnLColor(data.total_pnl_today)}`}>
                {formatCurrency(data.total_pnl_today)}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Recent Trades */}
      <div className="rounded-lg p-6 bg-gray-800 border border-gray-700">
        <div className="flex justify-between items-center mb-6">
          <h3 className="text-lg font-semibold text-white">Recent Trades</h3>
          <span className="text-sm text-gray-400">
            Last updated: {new Date(data.last_updated).toLocaleTimeString()}
          </span>
        </div>
        
        {data.trades.length === 0 ? (
          <div className="text-center py-8">
            <p className="text-gray-400">No trades found for today</p>
            <p className="text-sm text-gray-500 mt-2">
              Bot A will only trade when market conditions are favorable
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-700">
                  <th className="text-left py-3 px-4 text-gray-400 font-medium">Pair</th>
                  <th className="text-left py-3 px-4 text-gray-400 font-medium">Side</th>
                  <th className="text-left py-3 px-4 text-gray-400 font-medium">Size</th>
                  <th className="text-left py-3 px-4 text-gray-400 font-medium">Entry Price</th>
                  <th className="text-left py-3 px-4 text-gray-400 font-medium">Exit Price</th>
                  <th className="text-left py-3 px-4 text-gray-400 font-medium">P&L</th>
                  <th className="text-left py-3 px-4 text-gray-400 font-medium">Time</th>
                </tr>
              </thead>
              <tbody>
                {data.trades.map((trade, index) => (
                  <tr key={index} className="border-b border-gray-700 hover:bg-gray-700/50">
                    <td className="py-3 px-4 text-white font-medium">{trade.pair}</td>
                    <td className={`py-3 px-4 font-medium ${getSideColor(trade.side)}`}>
                      {trade.side.toUpperCase()}
                    </td>
                    <td className="py-3 px-4 text-gray-300">{trade.size.toFixed(6)}</td>
                    <td className="py-3 px-4 text-gray-300">
                      {formatCurrency(trade.entry_price)}
                    </td>
                    <td className="py-3 px-4 text-gray-300">
                      {trade.exit_price > 0 ? formatCurrency(trade.exit_price) : '-'}
                    </td>
                    <td className={`py-3 px-4 font-medium ${getPnLColor(trade.pnl_usd)}`}>
                      {formatCurrency(trade.pnl_usd)}
                    </td>
                    <td className="py-3 px-4 text-gray-400 text-sm">
                      {formatDate(trade.created_at)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}