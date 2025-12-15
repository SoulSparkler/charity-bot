'use client';

import { useState, useEffect } from 'react';

interface SentimentData {
  latest: {
    fgi_value: number;
    trend_score: number;
    mcs: number;
    created_at: string;
  };
  history: Array<{
    fgi_value: number;
    mcs: number;
    created_at: string;
  }>;
  statistics: {
    avg_fgi: number;
    avg_mcs: number;
    max_fgi: number;
    min_fgi: number;
    trend_direction: string;
  };
  last_updated: string;
}

interface SimpleChartProps {
  data: Array<{ fgi_value: number; mcs: number; created_at: string }>;
  width?: number;
  height?: number;
}

function SimpleChart({ data, width = 600, height = 200 }: SimpleChartProps) {
  if (!data || data.length === 0) {
    return (
      <div className="flex items-center justify-center h-48 bg-gray-800 rounded-lg">
        <p className="text-gray-400">No data available</p>
      </div>
    );
  }

  const padding = 40;
  const chartWidth = width - padding * 2;
  const chartHeight = height - padding * 2;

  // Process data for the chart (last 30 points for better visualization)
  const processedData = data.slice(0, 30).reverse();
  
  // Handle empty data case
  if (processedData.length === 0) {
    return (
      <div className="flex items-center justify-center h-48 bg-gray-800 rounded-lg">
        <p className="text-gray-400">No historical data available</p>
      </div>
    );
  }
  
  const fgiValues = processedData.map(d => d.fgi_value);
  const mcsValues = processedData.map(d => d.mcs * 100); // Scale MCS to 0-100 for visualization

  const minFgi = Math.min(...fgiValues);
  const maxFgi = Math.max(...fgiValues);
  const minMcs = 0;
  const maxMcs = 100;

  const getX = (index: number) => {
    return padding + (index / (processedData.length - 1)) * chartWidth;
  };

  const getYFgi = (value: number) => {
    return height - padding - ((value - minFgi) / (maxFgi - minFgi)) * chartHeight;
  };

  const getYMcs = (value: number) => {
    return height - padding - ((value - minMcs) / (maxMcs - minMcs)) * chartHeight;
  };

  // Create path for FGI line
  const fgiPath = fgiValues.map((value, index) => 
    `${index === 0 ? 'M' : 'L'} ${getX(index)} ${getYFgi(value)}`
  ).join(' ');

  // Create path for MCS line
  const mcsPath = mcsValues.map((value, index) => 
    `${index === 0 ? 'M' : 'L'} ${getX(index)} ${getYMcs(value)}`
  ).join(' ');

  return (
    <div className="bg-gray-800 rounded-lg p-4">
      <svg width={width} height={height} className="w-full h-auto">
        {/* Grid lines */}
        {[0, 0.25, 0.5, 0.75, 1].map((ratio, index) => (
          <line
            key={index}
            x1={padding}
            y1={height - padding - ratio * chartHeight}
            x2={width - padding}
            y2={height - padding - ratio * chartHeight}
            stroke="#374151"
            strokeWidth="1"
            strokeDasharray="2,2"
          />
        ))}
        
        {/* Y-axis labels */}
        <text x="10" y={height - padding + 5} fill="#9CA3AF" fontSize="10">0</text>
        <text x="10" y={height - padding - chartHeight * 0.25 + 5} fill="#9CA3AF" fontSize="10">25</text>
        <text x="10" y={height - padding - chartHeight * 0.5 + 5} fill="#9CA3AF" fontSize="10">50</text>
        <text x="10" y={height - padding - chartHeight * 0.75 + 5} fill="#9CA3AF" fontSize="10">75</text>
        <text x="10" y={height - padding - chartHeight + 5} fill="#9CA3AF" fontSize="10">100</text>

        {/* X-axis labels */}
        <text x={padding} y={height - 10} fill="#9CA3AF" fontSize="10">30d ago</text>
        <text x={width - padding - 30} y={height - 10} fill="#9CA3AF" fontSize="10">Now</text>

        {/* FGI Line (Blue) */}
        <path
          d={fgiPath}
          fill="none"
          stroke="#3B82F6"
          strokeWidth="2"
          className="drop-shadow-sm"
        />
        
        {/* MCS Line (Green) */}
        <path
          d={mcsPath}
          fill="none"
          stroke="#10B981"
          strokeWidth="2"
          className="drop-shadow-sm"
        />

        {/* Data points for FGI */}
        {fgiValues.map((value, index) => (
          <circle
            key={`fgi-${index}`}
            cx={getX(index)}
            cy={getYFgi(value)}
            r="3"
            fill="#3B82F6"
            className="opacity-75 hover:opacity-100 cursor-pointer"
          />
        ))}

        {/* Data points for MCS */}
        {mcsValues.map((value, index) => (
          <circle
            key={`mcs-${index}`}
            cx={getX(index)}
            cy={getYMcs(value)}
            r="3"
            fill="#10B981"
            className="opacity-75 hover:opacity-100 cursor-pointer"
          />
        ))}
      </svg>
      
      <div className="flex justify-center space-x-6 mt-4">
        <div className="flex items-center space-x-2">
          <div className="w-3 h-3 bg-blue-500 rounded-full"></div>
          <span className="text-sm text-gray-300">Fear & Greed Index</span>
        </div>
        <div className="flex items-center space-x-2">
          <div className="w-3 h-3 bg-green-500 rounded-full"></div>
          <span className="text-sm text-gray-300">Market Confidence Score</span>
        </div>
      </div>
    </div>
  );
}

export default function SentimentPage() {
  const [data, setData] = useState<SentimentData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchSentimentData();
    
    // Set up auto-refresh
    const interval = setInterval(fetchSentimentData, 60000); // 1 minute for sentiment data
    return () => clearInterval(interval);
  }, []);

  const fetchSentimentData = async () => {
    try {
      console.log('🔍 Frontend: Fetching sentiment data...');
      const response = await fetch('/api/dashboard/sentiment');
      console.log(`📡 Frontend: Response status: ${response.status}`);
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error('❌ Frontend: API error:', errorText);
        throw new Error(`HTTP ${response.status}: ${errorText}`);
      }
      
      const sentimentData = await response.json();
      console.log('📊 Frontend: Received data:', sentimentData);
      
      // Validate data structure
      if (!sentimentData || !sentimentData.latest) {
        console.error('❌ Frontend: Invalid data structure:', sentimentData);
        throw new Error('Invalid data structure received');
      }
      
      setData(sentimentData);
      console.log('✅ Frontend: Data set successfully');
    } catch (error) {
      console.error('❌ Frontend: Failed to fetch sentiment data:', error);
    } finally {
      setLoading(false);
    }
  };

  const getFGIColor = (value: number) => {
    if (value >= 75) return 'text-green-400'; // Extreme Greed
    if (value >= 55) return 'text-yellow-400'; // Greed
    if (value >= 45) return 'text-gray-400'; // Neutral
    if (value >= 25) return 'text-orange-400'; // Fear
    return 'text-red-400'; // Extreme Fear
  };

  const getFGILabel = (value: number) => {
    if (value >= 75) return 'Extreme Greed';
    if (value >= 55) return 'Greed';
    if (value >= 45) return 'Neutral';
    if (value >= 25) return 'Fear';
    return 'Extreme Fear';
  };

  const getMCSColor = (value: number) => {
    if (value >= 0.8) return 'text-green-400';
    if (value >= 0.6) return 'text-yellow-400';
    if (value >= 0.4) return 'text-orange-400';
    return 'text-red-400';
  };

  const getMCSLabel = (value: number) => {
    if (value >= 0.8) return 'Very High Confidence';
    if (value >= 0.6) return 'High Confidence';
    if (value >= 0.4) return 'Medium Confidence';
    if (value >= 0.2) return 'Low Confidence';
    return 'Very Low Confidence';
  };

  const formatTrendScore = (score: number) => {
    const sign = score >= 0 ? '+' : '';
    return `${sign}${score.toFixed(3)}`;
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString();
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="text-center">
          <h1 className="text-3xl font-bold text-white mb-2">Sentiment Analysis</h1>
          <div className="h-4 bg-gray-700 rounded w-64 mx-auto animate-pulse"></div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="rounded-lg p-6 bg-gray-800 border border-gray-700 animate-pulse">
              <div className="h-4 bg-gray-700 rounded mb-4"></div>
              <div className="h-8 bg-gray-700 rounded"></div>
            </div>
          ))}
        </div>
        <div className="rounded-lg p-6 bg-gray-800 border border-gray-700">
          <div className="h-48 bg-gray-700 rounded animate-pulse"></div>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-400 text-lg">Failed to load sentiment data</p>
        <button 
          onClick={fetchSentimentData}
          className="mt-4 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors"
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
          <h1 className="text-3xl font-bold text-white">Sentiment Analysis</h1>
          <p className="text-gray-400 mt-2">
            Real-time market sentiment and confidence scoring for trading decisions
          </p>
        </div>
        <div className="flex items-center space-x-4">
          <button
            onClick={fetchSentimentData}
            className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg transition-colors"
          >
            🔄 Refresh
          </button>
        </div>
      </div>

      {/* Main Sentiment Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="rounded-lg p-6 bg-gray-800 border border-gray-700">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-gray-400 text-sm font-medium uppercase tracking-wide">Fear & Greed Index</p>
              <p className={`text-3xl font-bold mt-2 ${getFGIColor(data.latest.fgi_value)}`}>
                {data.latest.fgi_value}
              </p>
              <p className={`text-sm mt-1 ${getFGIColor(data.latest.fgi_value)}`}>
                {getFGILabel(data.latest.fgi_value)}
              </p>
            </div>
            <div className="text-4xl">
              {data.latest.fgi_value >= 75 ? '🤑' : 
               data.latest.fgi_value >= 55 ? '😊' : 
               data.latest.fgi_value >= 45 ? '😐' : 
               data.latest.fgi_value >= 25 ? '😰' : '😱'}
            </div>
          </div>
        </div>

        <div className="rounded-lg p-6 bg-gray-800 border border-gray-700">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-gray-400 text-sm font-medium uppercase tracking-wide">Market Confidence Score</p>
              <p className={`text-3xl font-bold mt-2 ${getMCSColor(data.latest.mcs)}`}>
                {data.latest.mcs.toFixed(3)}
              </p>
              <p className={`text-sm mt-1 ${getMCSColor(data.latest.mcs)}`}>
                {getMCSLabel(data.latest.mcs)}
              </p>
            </div>
            <div className="text-4xl">
              {data.latest.mcs >= 0.8 ? '🚀' : 
               data.latest.mcs >= 0.6 ? '📈' : 
               data.latest.mcs >= 0.4 ? '⚖️' : 
               data.latest.mcs >= 0.2 ? '📉' : '💥'}
            </div>
          </div>
        </div>

        <div className="rounded-lg p-6 bg-gray-800 border border-gray-700">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-gray-400 text-sm font-medium uppercase tracking-wide">Trend Score</p>
              <p className={`text-3xl font-bold mt-2 ${
                data.latest.trend_score >= 0 ? 'text-green-400' : 'text-red-400'
              }`}>
                {formatTrendScore(data.latest.trend_score)}
              </p>
              <p className="text-sm text-gray-400 mt-1">
                BTC vs EMA200
              </p>
            </div>
            <div className="text-4xl">
              {data.latest.trend_score >= 0.1 ? '📈' : 
               data.latest.trend_score <= -0.1 ? '📉' : '➡️'}
            </div>
          </div>
        </div>
      </div>

      {/* Chart */}
      <div className="rounded-lg p-6 bg-gray-800 border border-gray-700">
        <div className="flex justify-between items-center mb-6">
          <h3 className="text-lg font-semibold text-white">30-Day Sentiment History</h3>
          <span className="text-sm text-gray-400">
            Last updated: {new Date(data.last_updated).toLocaleTimeString()}
          </span>
        </div>
        <SimpleChart data={data.history} />
      </div>

      {/* Statistics */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="rounded-lg p-6 bg-gray-800 border border-gray-700">
          <h3 className="text-lg font-semibold text-white mb-4">Fear & Greed Statistics</h3>
          <div className="space-y-3">
            <div className="flex justify-between">
              <span className="text-gray-400">30-Day Average</span>
              <span className="text-white font-medium">{data.statistics.avg_fgi.toFixed(1)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">Highest (30 days)</span>
              <span className="text-green-400 font-medium">{data.statistics.max_fgi}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">Lowest (30 days)</span>
              <span className="text-red-400 font-medium">{data.statistics.min_fgi}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">Current Status</span>
              <span className={`font-medium ${getFGIColor(data.latest.fgi_value)}`}>
                {getFGILabel(data.latest.fgi_value)}
              </span>
            </div>
          </div>
        </div>

        <div className="rounded-lg p-6 bg-gray-800 border border-gray-700">
          <h3 className="text-lg font-semibold text-white mb-4">Market Confidence Statistics</h3>
          <div className="space-y-3">
            <div className="flex justify-between">
              <span className="text-gray-400">30-Day Average</span>
              <span className="text-white font-medium">{data.statistics.avg_mcs.toFixed(3)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">Trend Direction</span>
              <span className={`font-medium ${
                data.statistics.trend_direction === 'Bullish' ? 'text-green-400' :
                data.statistics.trend_direction === 'Bearish' ? 'text-red-400' : 'text-gray-400'
              }`}>
                {data.statistics.trend_direction}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">Current Level</span>
              <span className={`font-medium ${getMCSColor(data.latest.mcs)}`}>
                {getMCSLabel(data.latest.mcs)}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">Data Points</span>
              <span className="text-white font-medium">{data.history.length}</span>
            </div>
          </div>
        </div>
      </div>

      {/* How It Works */}
      <div className="rounded-lg p-6 bg-gradient-to-r from-purple-900/50 to-blue-900/50 border border-purple-700">
        <h3 className="text-lg font-semibold text-white mb-4 flex items-center">
          <span className="text-2xl mr-2">📊</span>
          How Sentiment Analysis Works
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <h4 className="font-medium text-white mb-2">Fear & Greed Index (60% weight)</h4>
            <p className="text-sm text-gray-300 mb-4">
              Collected from Alternative.me API, measuring investor sentiment from extreme fear to extreme greed.
            </p>
            
            <h4 className="font-medium text-white mb-2">Technical Trend (40% weight)</h4>
            <p className="text-sm text-gray-300">
              Compares BTC price to 200-period EMA on 1-hour charts. Above EMA = bullish (+0.2), below = bearish (-0.2).
            </p>
          </div>
          
          <div>
            <h4 className="font-medium text-white mb-2">Market Confidence Score</h4>
            <p className="text-sm text-gray-300 mb-4">
              Composite score (0-1) used to adjust bot trading parameters. Higher MCS = more aggressive trading.
            </p>
            
            <h4 className="font-medium text-white mb-2">Update Frequency</h4>
            <p className="text-sm text-gray-300">
              Sentiment data is refreshed every 15 minutes, ensuring bots have current market conditions for trading decisions.
            </p>
          </div>
        </div>
      </div>

      {/* Latest Reading Details */}
      <div className="rounded-lg p-6 bg-gray-800 border border-gray-700">
        <h3 className="text-lg font-semibold text-white mb-4">Latest Reading Details</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="text-center">
            <p className="text-gray-400 text-sm">Timestamp</p>
            <p className="text-white font-medium mt-1">
              {formatDate(data.latest.created_at)}
            </p>
          </div>
          <div className="text-center">
            <p className="text-gray-400 text-sm">FGI Value</p>
            <p className={`font-bold text-lg mt-1 ${getFGIColor(data.latest.fgi_value)}`}>
              {data.latest.fgi_value}/100
            </p>
          </div>
          <div className="text-center">
            <p className="text-gray-400 text-sm">MCS Value</p>
            <p className={`font-bold text-lg mt-1 ${getMCSColor(data.latest.mcs)}`}>
              {data.latest.mcs.toFixed(3)}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}