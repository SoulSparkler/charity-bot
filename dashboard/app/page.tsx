'use client';

import { useState, useEffect } from 'react';

interface DashboardState {
  botA_virtual_usd: number;
  botB_virtual_usd: number;
  cycle_number: number;
  cycle_target: number;
  mcs: number;
  fgi: number;
  open_trades: number;
  botA_today_trades: number;
  botB_today_trades: number;
  botA_win_rate: number;
  botB_win_rate: number;
  botB_mtd_pnl: number;
  last_updated: string;
}

interface StatCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  trend?: 'up' | 'down' | 'neutral';
  className?: string;
}

function StatCard({ title, value, subtitle, trend, className = '' }: StatCardProps) {
  const getTrendColor = () => {
    switch (trend) {
      case 'up': return 'text-green-400';
      case 'down': return 'text-red-400';
      default: return 'text-gray-400';
    }
  };

  return (
    <div className={`rounded-lg p-6 bg-gray-800 border border-gray-700 shadow-lg hover:shadow-xl transition-shadow duration-300 ${className}`}>
      <div className="flex items-center justify-between">
        <div>
          <p className="text-gray-400 text-sm font-medium uppercase tracking-wide">{title}</p>
          <p className="text-2xl font-bold text-white mt-2">{value}</p>
          {subtitle && (
            <p className={`text-sm mt-1 ${getTrendColor()}`}>{subtitle}</p>
          )}
        </div>
        {trend && (
          <div className={`text-2xl ${getTrendColor()}`}>
            {trend === 'up' ? '↗️' : trend === 'down' ? '↘️' : '➡️'}
          </div>
        )}
      </div>
    </div>
  );
}

export default function Dashboard() {
  const [state, setState] = useState<DashboardState | null>(null);
  const [loading, setLoading] = useState(true);
  const [demoMode, setDemoMode] = useState(true);

  useEffect(() => {
    fetchDashboardState();
    
    // Set up auto-refresh
    const interval = setInterval(fetchDashboardState, 30000); // 30 seconds
    return () => clearInterval(interval);
  }, [demoMode]);

  const fetchDashboardState = async () => {
    try {
      const response = await fetch(`/api/dashboard/state?demo=${demoMode}`);
      if (response.ok) {
        const data = await response.json();
        setState(data);
      }
    } catch (error) {
      console.error('Failed to fetch dashboard state:', error);
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

  const formatNumber = (value: number, decimals: number = 2) => {
    return value.toFixed(decimals);
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="text-center">
          <h1 className="text-3xl font-bold text-white mb-8">Dashboard Overview</h1>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="rounded-lg p-6 bg-gray-800 border border-gray-700 animate-pulse">
              <div className="h-4 bg-gray-700 rounded mb-4"></div>
              <div className="h-8 bg-gray-700 rounded"></div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (!state) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-400 text-lg">Failed to load dashboard data</p>
        <button 
          onClick={fetchDashboardState}
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
          <h1 className="text-3xl font-bold text-white">Dashboard Overview</h1>
          <p className="text-gray-400 mt-2">
            Last updated: {new Date(state.last_updated).toLocaleString()}
          </p>
        </div>
        <div className="flex items-center space-x-4">
          <button
            onClick={() => setDemoMode(!demoMode)}
            className={`px-4 py-2 rounded-lg font-medium transition-colors ${
              demoMode 
                ? 'bg-green-600 hover:bg-green-700 text-white' 
                : 'bg-gray-600 hover:bg-gray-700 text-white'
            }`}
          >
            {demoMode ? '🧪 Demo Mode ON' : '🔗 Live Mode'}
          </button>
          <button
            onClick={fetchDashboardState}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
          >
            🔄 Refresh
          </button>
        </div>
      </div>

      {/* Main Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        <StatCard
          title="Bot A Balance"
          value={formatCurrency(state.botA_virtual_usd)}
          subtitle={`Cycle ${state.cycle_number} of ${formatCurrency(state.cycle_target)}`}
          trend={state.botA_virtual_usd >= state.cycle_target ? 'up' : 'neutral'}
          className="lg:col-span-1"
        />
        
        <StatCard
          title="Bot B Balance"
          value={formatCurrency(state.botB_virtual_usd)}
          subtitle={`MTD P&L: ${formatCurrency(state.botB_mtd_pnl)}`}
          trend={state.botB_mtd_pnl > 0 ? 'up' : state.botB_mtd_pnl < 0 ? 'down' : 'neutral'}
          className="lg:col-span-1"
        />

        <StatCard
          title="Market Confidence"
          value={formatNumber(state.mcs, 3)}
          subtitle={`FGI: ${state.fgi}/100`}
          trend={state.mcs >= 0.7 ? 'up' : state.mcs >= 0.4 ? 'neutral' : 'down'}
          className="lg:col-span-1"
        />

        <StatCard
          title="Open Trades"
          value={state.open_trades}
          subtitle={`${state.botA_today_trades} Bot A + ${state.botB_today_trades} Bot B today`}
          className="lg:col-span-1"
        />

        <StatCard
          title="Bot A Win Rate"
          value={formatPercentage(state.botA_win_rate)}
          subtitle="Today's performance"
          trend={state.botA_win_rate >= 0.5 ? 'up' : 'down'}
          className="lg:col-span-1"
        />

        <StatCard
          title="Bot B Win Rate"
          value={formatPercentage(state.botB_win_rate)}
          subtitle="Today's performance"
          trend={state.botB_win_rate >= 0.6 ? 'up' : 'down'}
          className="lg:col-span-1"
        />
      </div>

      {/* Cycle Progress */}
      <div className="rounded-lg p-6 bg-gray-800 border border-gray-700">
        <h3 className="text-lg font-semibold text-white mb-4">Bot A Cycle Progress</h3>
        <div className="space-y-3">
          <div className="flex justify-between text-sm">
            <span className="text-gray-400">Current Balance</span>
            <span className="text-white font-medium">{formatCurrency(state.botA_virtual_usd)}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-gray-400">Cycle Target</span>
            <span className="text-white font-medium">{formatCurrency(state.cycle_target)}</span>
          </div>
          <div className="w-full bg-gray-700 rounded-full h-3">
            <div 
              className="bg-gradient-to-r from-blue-500 to-green-500 h-3 rounded-full transition-all duration-500"
              style={{ 
                width: `${Math.min((state.botA_virtual_usd / state.cycle_target) * 100, 100)}%` 
              }}
            ></div>
          </div>
          <div className="flex justify-between text-xs">
            <span className="text-gray-400">
              {((state.botA_virtual_usd / state.cycle_target) * 100).toFixed(1)}% Complete
            </span>
            <span className="text-gray-400">
              {state.botA_virtual_usd >= state.cycle_target ? '✅ Target Reached!' : '🎯 In Progress'}
            </span>
          </div>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <a
          href="/bot-a"
          className="block p-4 bg-gradient-to-r from-blue-600 to-blue-700 rounded-lg hover:from-blue-700 hover:to-blue-800 transition-all duration-300 transform hover:scale-105"
        >
          <div className="text-center">
            <div className="text-2xl mb-2">🤖</div>
            <h3 className="font-semibold text-white">View Bot A</h3>
            <p className="text-blue-100 text-sm mt-1">Aggressive Growth Engine</p>
          </div>
        </a>

        <a
          href="/bot-b"
          className="block p-4 bg-gradient-to-r from-green-600 to-green-700 rounded-lg hover:from-green-700 hover:to-green-800 transition-all duration-300 transform hover:scale-105"
        >
          <div className="text-center">
            <div className="text-2xl mb-2">💝</div>
            <h3 className="font-semibold text-white">View Bot B</h3>
            <p className="text-green-100 text-sm mt-1">Donation Engine</p>
          </div>
        </a>

        <a
          href="/sentiment"
          className="block p-4 bg-gradient-to-r from-purple-600 to-purple-700 rounded-lg hover:from-purple-700 hover:to-purple-800 transition-all duration-300 transform hover:scale-105"
        >
          <div className="text-center">
            <div className="text-2xl mb-2">📊</div>
            <h3 className="font-semibold text-white">Sentiment Analysis</h3>
            <p className="text-purple-100 text-sm mt-1">Market Confidence Score</p>
          </div>
        </a>
      </div>

      {/* Status Indicators */}
      <div className="rounded-lg p-6 bg-gray-800 border border-gray-700">
        <h3 className="text-lg font-semibold text-white mb-4">System Status</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="flex items-center space-x-3">
            <div className="w-3 h-3 bg-green-500 rounded-full animate-pulse"></div>
            <span className="text-gray-300">Bot A Active</span>
          </div>
          <div className="flex items-center space-x-3">
            <div className="w-3 h-3 bg-green-500 rounded-full animate-pulse"></div>
            <span className="text-gray-300">Bot B Active</span>
          </div>
          <div className="flex items-center space-x-3">
            <div className="w-3 h-3 bg-blue-500 rounded-full animate-pulse"></div>
            <span className="text-gray-300">Sentiment Updated</span>
          </div>
          <div className="flex items-center space-x-3">
            <div className="w-3 h-3 bg-yellow-500 rounded-full animate-pulse"></div>
            <span className="text-gray-300">Database Connected</span>
          </div>
        </div>
      </div>
    </div>
  );
}