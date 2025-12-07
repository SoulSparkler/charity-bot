'use client';

import { useState, useEffect } from 'react';

interface BotBTrade {
  pair: string;
  side: 'buy' | 'sell';
  size: number;
  entry_price: number;
  exit_price: number;
  pnl_usd: number;
  created_at: string;
}

interface MonthlyReport {
  month: string;
  botB_start_balance: number;
  botB_end_balance: number;
  donation_amount: number;
  created_at: string;
}

interface BotBData {
  current_balance: number;
  mtd_pnl: number;
  estimated_next_month_donation: number;
  today_trades: number;
  win_rate: number;
  total_pnl_today: number;
  monthly_reports: MonthlyReport[];
  risk_mode: string;
  trades: BotBTrade[];
  sentiment: {
    mcs: number;
    risk_level: string;
  };
  last_updated: string;
}

export default function BotBPage() {
  const [data, setData] = useState<BotBData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchBotBData();
    
    // Set up auto-refresh
    const interval = setInterval(fetchBotBData, 30000); // 30 seconds
    return () => clearInterval(interval);
  }, []);

  const fetchBotBData = async () => {
    try {
      const response = await fetch('/api/dashboard/bot-b');
      if (response.ok) {
        const botData = await response.json();
        setData(botData);
      }
    } catch (error) {
      console.error('Failed to fetch Vorgina data:', error);
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
    return new Date(dateString).toLocaleDateString();
  };

  const formatMonth = (monthString: string) => {
    const [year, month] = monthString.split('-');
    const date = new Date(parseInt(year), parseInt(month) - 1);
    return date.toLocaleDateString('en-US', { year: 'numeric', month: 'long' });
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
          <h1 className="text-3xl font-bold text-white mb-2">Vorgina - Donation Engine</h1>
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
      </div>
    );
  }

  if (!data) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-400 text-lg">Failed to load Vorgina data</p>
        <button 
          onClick={fetchBotBData}
          className="mt-4 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
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
          <h1 className="text-3xl font-bold text-white">Vorgina - Donation Engine</h1>
          <p className="text-gray-400 mt-2">
            Conservative trading focused on generating consistent charitable donations
          </p>
        </div>
        <button
          onClick={fetchBotBData}
          className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg transition-colors"
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
              <p className="text-gray-400 text-sm font-medium uppercase tracking-wide">Month-to-Date P&L</p>
              <p className={`text-2xl font-bold mt-2 ${getPnLColor(data.mtd_pnl)}`}>
                {formatCurrency(data.mtd_pnl)}
              </p>
            </div>
            <div className={`text-3xl ${data.mtd_pnl >= 0 ? '📈' : '📉'}`}></div>
          </div>
        </div>

        <div className="rounded-lg p-6 bg-gray-800 border border-gray-700">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-gray-400 text-sm font-medium uppercase tracking-wide">Est. Next Donation</p>
              <p className="text-2xl font-bold text-green-400 mt-2">
                {formatCurrency(data.estimated_next_month_donation)}
              </p>
              <p className="text-xs text-gray-400 mt-1">
                50% of monthly profits
              </p>
            </div>
            <div className="text-3xl">💝</div>
          </div>
        </div>

        <div className="rounded-lg p-6 bg-gray-800 border border-gray-700">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-gray-400 text-sm font-medium uppercase tracking-wide">Win Rate</p>
              <p className={`text-2xl font-bold mt-2 ${data.win_rate >= 0.6 ? 'text-green-400' : 'text-yellow-400'}`}>
                {formatPercentage(data.win_rate)}
              </p>
              <p className="text-sm text-gray-400 mt-1">
                {data.today_trades} trades today
              </p>
            </div>
            <div className="text-3xl">📊</div>
          </div>
        </div>
      </div>

      {/* Donation Progress */}
      <div className="rounded-lg p-6 bg-gradient-to-r from-green-900/50 to-emerald-900/50 border border-green-700">
        <h3 className="text-lg font-semibold text-white mb-4 flex items-center">
          <span className="text-2xl mr-2">💝</span>
          Monthly Donation Status
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="text-center">
            <p className="text-gray-400 text-sm">Month-to-Date P&L</p>
            <p className={`text-3xl font-bold ${getPnLColor(data.mtd_pnl)}`}>
              {formatCurrency(data.mtd_pnl)}
            </p>
          </div>
          <div className="text-center">
            <p className="text-gray-400 text-sm">Estimated Donation</p>
            <p className="text-3xl font-bold text-green-400">
              {formatCurrency(data.estimated_next_month_donation)}
            </p>
          </div>
          <div className="text-center">
            <p className="text-gray-400 text-sm">Donation Percentage</p>
            <p className="text-3xl font-bold text-blue-400">50%</p>
          </div>
        </div>
        <div className="mt-4 p-4 bg-gray-800/50 rounded-lg">
          <p className="text-sm text-gray-300">
            <strong>How it works:</strong> At the end of each month, Vorgina calculates its profits and donates 50% 
            to charitable causes. The donation process is manual to ensure transparency and proper oversight.
          </p>
        </div>
      </div>

      {/* Risk & Trading Info */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="rounded-lg p-6 bg-gray-800 border border-gray-700">
          <h3 className="text-lg font-semibold text-white mb-4">Conservative Strategy</h3>
          <div className="space-y-3">
            <div className="flex justify-between">
              <span className="text-gray-400">Risk Profile</span>
              <span className="text-green-400 font-medium">Conservative</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">Max Position Size</span>
              <span className="text-white font-medium">0.5% of balance</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">Max Daily Trades</span>
              <span className="text-white font-medium">2 trades</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">Min MCS Required</span>
              <span className="text-white font-medium">0.5</span>
            </div>
          </div>
        </div>

        <div className="rounded-lg p-6 bg-gray-800 border border-gray-700">
          <h3 className="text-lg font-semibold text-white mb-4">Today's Performance</h3>
          <div className="space-y-3">
            <div className="flex justify-between">
              <span className="text-gray-400">Trades Executed</span>
              <span className="text-white font-medium">{data.today_trades}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">Win Rate</span>
              <span className={`font-medium ${data.win_rate >= 0.6 ? 'text-green-400' : 'text-yellow-400'}`}>
                {formatPercentage(data.win_rate)}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">P&L Today</span>
              <span className={`font-medium ${getPnLColor(data.total_pnl_today)}`}>
                {formatCurrency(data.total_pnl_today)}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Monthly Reports */}
      <div className="rounded-lg p-6 bg-gray-800 border border-gray-700">
        <h3 className="text-lg font-semibold text-white mb-6">Monthly Donation Reports</h3>
        
        {data.monthly_reports.length === 0 ? (
          <div className="text-center py-8">
            <p className="text-gray-400">No monthly reports yet</p>
            <p className="text-sm text-gray-500 mt-2">
              Monthly reports are generated on the 1st of each month
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-700">
                  <th className="text-left py-3 px-4 text-gray-400 font-medium">Month</th>
                  <th className="text-left py-3 px-4 text-gray-400 font-medium">Start Balance</th>
                  <th className="text-left py-3 px-4 text-gray-400 font-medium">End Balance</th>
                  <th className="text-left py-3 px-4 text-gray-400 font-medium">Monthly P&L</th>
                  <th className="text-left py-3 px-4 text-gray-400 font-medium">Donation Amount</th>
                  <th className="text-left py-3 px-4 text-gray-400 font-medium">Date</th>
                </tr>
              </thead>
              <tbody>
                {data.monthly_reports.map((report, index) => {
                  const monthlyPnL = report.botB_end_balance - report.botB_start_balance;
                  return (
                    <tr key={index} className="border-b border-gray-700 hover:bg-gray-700/50">
                      <td className="py-3 px-4 text-white font-medium">
                        {formatMonth(report.month)}
                      </td>
                      <td className="py-3 px-4 text-gray-300">
                        {formatCurrency(report.botB_start_balance)}
                      </td>
                      <td className="py-3 px-4 text-gray-300">
                        {formatCurrency(report.botB_end_balance)}
                      </td>
                      <td className={`py-3 px-4 font-medium ${getPnLColor(monthlyPnL)}`}>
                        {formatCurrency(monthlyPnL)}
                      </td>
                      <td className="py-3 px-4 text-green-400 font-medium">
                        {formatCurrency(report.donation_amount)}
                      </td>
                      <td className="py-3 px-4 text-gray-400 text-sm">
                        {formatDate(report.created_at)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
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
              Vorgina only trades when market confidence is high (MCS ≥ 0.5)
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
                      {new Date(trade.created_at).toLocaleString()}
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