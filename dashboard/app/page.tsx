'use client';

import { useEffect, useState } from 'react';

interface KrakenStatus {
  status: string;
  mode: string;
  apiKeyConfigured: boolean;
  apiSecretConfigured: boolean;
  realTradingEnabled: boolean;
  tradeConfirmationRequired: boolean;
  mockMode?: boolean;
}

interface SellBTCModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSell: (usdAmount: number) => Promise<void>;
  btcBalance: number;
  loading: boolean;
}

function SellBTCModal({ isOpen, onClose, onSell, btcBalance, loading }: SellBTCModalProps) {
  const [usdAmount, setUsdAmount] = useState<string>('');
  const [error, setError] = useState<string>('');

  useEffect(() => {
    if (isOpen) {
      setUsdAmount('');
      setError('');
    }
  }, [isOpen]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    const amount = parseFloat(usdAmount);
    if (isNaN(amount) || amount <= 0) {
      setError('Please enter a valid positive number');
      return;
    }

    if (amount < 9.20) {
      setError('Minimum sell amount is $9.20 USD (0.0001 BTC)');
      return;
    }

    try {
      await onSell(amount);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    }
  };

  const handleCancel = () => {
    setUsdAmount('');
    setError('');
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-gray-800 rounded-lg p-6 w-full max-w-md mx-4">
        <h3 className="text-lg font-semibold text-white mb-4">Sell BTC</h3>
        <p className="text-gray-400 text-sm mb-4">
          How much USD do you want to sell from BTC?
        </p>
        <p className="text-gray-300 text-sm mb-4">
          Available BTC: {btcBalance.toFixed(8)} BTC
        </p>
        
        <form onSubmit={handleSubmit}>
          <div className="mb-4">
            <label className="block text-gray-300 text-sm font-medium mb-2">
              USD Amount
            </label>
            <input
              type="number"
              value={usdAmount}
              onChange={(e) => setUsdAmount(e.target.value)}
              placeholder="Enter USD amount"
              className="w-full px-3 py-2 bg-gray-700 border border-gray-600 focus rounded-md text-white:outline-none focus:ring-2 focus:ring-blue-500"
              min="0"
              step="0.01"
              disabled={loading}
            />
            {error && (
              <p className="text-red-400 text-sm mt-1">{error}</p>
            )}
          </div>
          
          <div className="flex space-x-3">
            <button
              type="button"
              onClick={handleCancel}
              disabled={loading}
              className="flex-1 px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-700 transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading || !usdAmount}
              className="flex-1 px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 transition-colors disabled:opacity-50"
            >
              {loading ? 'Selling...' : 'Sell BTC'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

interface SimpleSellBTCModalProps {
  isOpen: boolean;
  onClose: () => void;
}

function SimpleSellBTCModal({ isOpen, onClose }: SimpleSellBTCModalProps) {
  const [usdAmount, setUsdAmount] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleContinue = async () => {
    setIsSubmitting(true);
    try {
      const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:3000';
      const response = await fetch(`${backendUrl}/api/sell-btc`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ usdAmount: Number(usdAmount) })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to sell BTC');
      }

      console.log("Sell BTC success:", data);
      setUsdAmount("");
      onClose();
    } catch (error) {
      console.error("Sell BTC error:", error);
      alert(error instanceof Error ? error.message : 'An error occurred');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-gray-800 rounded-lg p-6 w-full max-w-md mx-4">
        <h3 className="text-lg font-semibold text-white mb-4">Sell BTC Modal</h3>
        
        <div className="mb-4">
          <label className="block text-gray-300 text-sm font-medium mb-2">
            USD Amount
          </label>
          <input
            type="number"
            value={usdAmount}
            onChange={(e) => setUsdAmount(e.target.value)}
            placeholder="Enter USD amount"
            className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-md text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        
        <div className="flex justify-end space-x-3">
          <button
            onClick={onClose}
            disabled={isSubmitting}
            className="px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-700 transition-colors disabled:opacity-50"
          >
            Close
          </button>
          <button
            onClick={handleContinue}
            disabled={isSubmitting}
            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors disabled:opacity-50"
          >
            {isSubmitting ? "Processing..." : "Continue"}
          </button>
        </div>
      </div>
    </div>
  );
}

interface KrakenBalanceTests {
  connection: {
    success: boolean;
    message: string;
    data?: any;
  };
  balance: {
    success: boolean;
    message: string;
    balance: Record<string, string>;
  };
  status: KrakenStatus;
}

interface KrakenResponse {
  success: boolean;
  tests: KrakenBalanceTests;
  summary?: any;
  [key: string]: any;
}

interface PortfolioBalances {
  USD: number;
  BTC: number;
  ETH?: number;
  totalValue: number;
}

interface DashboardState {
  success: boolean;
  last_updated: string;
  kraken: KrakenResponse;
  portfolio?: PortfolioBalances | null;
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
      case 'up':
        return 'text-green-400';
      case 'down':
        return 'text-red-400';
      default:
        return 'text-gray-400';
    }
  };

  return (
    <div
      className={`rounded-lg p-6 bg-gray-800 border border-gray-700 shadow-lg hover:shadow-xl transition-shadow duration-300 ${className}`}
    >
      <div className="flex items-center justify-between">
        <div>
          <p className="text-gray-400 text-sm font-medium uppercase tracking-wide">
            {title}
          </p>
          <p className="text-2xl font-bold text-white mt-2 break-all">{value}</p>
          {subtitle && (
            <p className={`text-sm mt-1 ${getTrendColor()}`}>{subtitle}</p>
          )}
        </div>
        {trend && <div className={`text-2xl ${getTrendColor()}`}>⬤</div>}
      </div>
    </div>
  );
}

export default function Dashboard() {
  const [state, setState] = useState<DashboardState | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [demoMode, setDemoMode] = useState(false);
  const [modeSwitching, setModeSwitching] = useState(false);
  
  // Sell BTC functionality
  const [sellModalOpen, setSellModalOpen] = useState(false);
  const [selling, setSelling] = useState(false);
  const [sellResult, setSellResult] = useState<any>(null);
  const [sellError, setSellError] = useState<string | null>(null);
  const [showSellModal, setShowSellModal] = useState(false);

  const fetchDashboardState = async () => {
    try {
      setErrorMsg(null);
      const endpoint = demoMode ? '/api/dashboard/state?demo=true' : '/api/dashboard/state';
      const response = await fetch(endpoint, { cache: 'no-store' });
      const data = await response.json();
      if (!response.ok || data.success === false) {
        setErrorMsg(data.error || 'Failed to load dashboard state');
        setState(null);
      } else {
        setState(data);
      }
    } catch (error) {
      console.error('Failed to fetch dashboard state:', error);
      setErrorMsg('Failed to fetch dashboard data');
      setState(null);
    } finally {
      setLoading(false);
    }
  };

  const toggleDemoMode = async () => {
    setModeSwitching(true);
    setDemoMode(!demoMode);
    // Data will be refreshed by the useEffect
    setTimeout(() => setModeSwitching(false), 1000);
  };

  const sellBTC = async (usdAmount: number) => {
    setSelling(true);
    setSellError(null);
    setSellResult(null);

    try {
      const backendUrl = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:3000';
      const response = await fetch(`${backendUrl}/api/sell-btc`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ usdAmount }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to sell BTC');
      }

      setSellResult(data);
      
      // Refresh portfolio data after successful sell
      setTimeout(() => {
        fetchDashboardState();
      }, 1000);

      return data;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'An error occurred';
      setSellError(errorMessage);
      throw error;
    } finally {
      setSelling(false);
    }
  };

  useEffect(() => {
    fetchDashboardState();
    const interval = setInterval(fetchDashboardState, 30000); // 30 seconds
    return () => clearInterval(interval);
  }, []);

  const formatTimestamp = (ts: string) => {
    try {
      return new Date(ts).toLocaleString();
    } catch {
      return ts;
    }
  };

  const getBalanceEntries = (state: DashboardState | null) => {
    const balance =
      state?.kraken?.tests?.balance?.balance ?? ({} as Record<string, string>);
    return Object.entries(balance).filter(([asset]) => !asset.startsWith('_')); // Show only real assets in table
  };

  const handleSellBtcClick = () => {
    setShowSellModal(true);
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="text-center">
          <h1 className="text-3xl font-bold text-white mb-8">Charity Bot Dashboard</h1>
          <p className="text-gray-400">Loading live data from Kraken…</p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {[...Array(3)].map((_, i) => (
            <div
              key={i}
              className="rounded-lg p-6 bg-gray-800 border border-gray-700 animate-pulse"
            >
              <div className="h-4 bg-gray-700 rounded mb-4" />
              <div className="h-8 bg-gray-700 rounded" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (!state || !state.kraken) {
    return (
      <div className="space-y-4 text-center py-12">
        <h1 className="text-3xl font-bold text-white mb-4">Charity Bot Dashboard</h1>
        <p className="text-gray-400 text-lg">
          {errorMsg || 'Failed to load dashboard data'}
        </p>
        <button
          onClick={fetchDashboardState}
          className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
        >
          🔄 Retry
        </button>
      </div>
    );
  }

  const connection = state.kraken.tests.connection;
  const balanceTest = state.kraken.tests.balance;
  const status = state.kraken.tests.status;
  
  // Use clean portfolio data from backend when available
  const rawBalances = state?.kraken?.tests?.balance?.balance ?? {};
  const assetKeys = Object.keys(rawBalances).filter(key => !key.startsWith("_"));
  const assetCount = assetKeys.length;
  
  // Debug: Log portfolio data usage
  console.log('📊 Portfolio data usage:', {
    hasPortfolioData: !!state.portfolio,
    portfolioUSD: state.portfolio?.USD,
    portfolioBTC: state.portfolio?.BTC,
    portfolioETH: state.portfolio?.ETH,
    totalValue: state.portfolio?.totalValue,
    usingPortfolioData: !!state.portfolio
  });
  
  // Get balance entries for table display (showing raw Kraken data format)
  const balanceEntries = getBalanceEntries(state);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-white">Charity Bot Overview</h1>
          <p className="text-gray-400 mt-2">
            {demoMode ? 'Demo Mode' : 'Live Mode'} · Last updated:{' '}
            {formatTimestamp(state.last_updated)}
          </p>
        </div>
        <div className="flex space-x-2">
          <button
            onClick={toggleDemoMode}
            disabled={modeSwitching}
            className={`px-4 py-2 rounded-lg transition-colors font-medium ${
              demoMode
                ? 'bg-orange-600 hover:bg-orange-700 text-white'
                : 'bg-green-600 hover:bg-green-700 text-white'
            }`}
          >
            {modeSwitching ? '⏳ Switching...' : demoMode ? '🔄 Switch to Live' : '🔄 Switch to Demo'}
          </button>
          <button
            onClick={fetchDashboardState}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
          >
            🔄 Refresh
          </button>
        </div>
      </div>

      {/* Main Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <StatCard
          title="Kraken Connection"
          value={connection.success ? '✅ Online' : '⚠️ Offline'}
          subtitle={connection.message}
          trend={connection.success ? 'up' : 'down'}
        />

        <StatCard
          title="API Configuration"
          value={
            status.apiKeyConfigured && status.apiSecretConfigured
              ? 'Keys configured'
              : 'Missing keys'
          }
          subtitle={`Mode: ${status.mode}${
            status.realTradingEnabled ? ' · REAL TRADING ON' : ' · Read-only'
          }`}
          trend={
            status.apiKeyConfigured && status.apiSecretConfigured ? 'up' : 'down'
          }
        />

        <StatCard
          title="Assets on Kraken"
          value={assetCount > 0 ? `${assetCount} assets` : 'No assets detected'}
          subtitle={
            assetCount > 0
              ? 'Ready for strategy & donations'
              : 'Top up your account to start trading & donating'
          }
          trend={assetCount > 0 ? 'up' : 'neutral'}
        />
      </div>

      {/* Portfolio Balances - Clean Display */}
      <div className="rounded-lg p-6 bg-gray-800 border border-gray-700">
        <h3 className="text-lg font-semibold text-white mb-4">
          Portfolio Balances
        </h3>
        {state.portfolio ? (
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="bg-gray-700 rounded-lg p-4">
                <p className="text-gray-400 text-sm">USD Balance</p>
                <p className="text-2xl font-bold text-green-400">
                  ${state.portfolio.USD.toFixed(2)}
                </p>
              </div>
              <div className="bg-gray-700 rounded-lg p-4">
                <p className="text-gray-400 text-sm">BTC Balance</p>
                <p className="text-2xl font-bold text-orange-400">
                  {state.portfolio.BTC.toFixed(8)} BTC
                </p>
              </div>
              {state.portfolio.ETH && state.portfolio.ETH > 0 && (
                <div className="bg-gray-700 rounded-lg p-4">
                  <p className="text-gray-400 text-sm">ETH Balance</p>
                  <p className="text-2xl font-bold text-purple-400">
                    {state.portfolio.ETH.toFixed(8)} ETH
                  </p>
                </div>
              )}
              <div className="bg-gray-700 rounded-lg p-4">
                <p className="text-gray-400 text-sm">Total Portfolio Value</p>
                <p className="text-2xl font-bold text-blue-400">
                  ${state.portfolio.totalValue.toFixed(2)}
                </p>
              </div>
            </div>
            <div className="text-xs text-gray-500">
              Portfolio values calculated using real-time Kraken market data
            </div>
          </div>
        ) : assetCount > 0 ? (
          <div className="bg-yellow-900/20 border border-yellow-700 rounded-lg p-4">
            <p className="text-yellow-300 text-sm">
              ⚠️ Portfolio data unavailable. Raw balances detected but not processed. 
              Check backend /api/portfolio endpoint.
            </p>
          </div>
        ) : assetCount === 0 ? (
          <p className="text-gray-400">
            Kraken reports an empty balance. Once you deposit funds, they will show up
            here and can be linked to your charity logic.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="text-gray-400 border-b border-gray-700">
                  <th className="text-left py-2 pr-4">Asset</th>
                  <th className="text-right py-2">Amount</th>
                </tr>
              </thead>
              <tbody>
                {balanceEntries.map(([asset, amount]) => (
                  <tr key={asset} className="border-b border-gray-800">
                    <td className="py-2 pr-4 text-gray-200">
                      {asset}
                    </td>
                    <td className="py-2 text-right text-gray-100">{amount}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        
        {/* Sell BTC Button */}
        <div className="mt-4 flex justify-end">
          <button
            className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors font-medium"
            onClick={() => handleSellBtcClick()}
          >
            Sell BTC
          </button>
        </div>
      </div>

      {/* Donation & safety status */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="rounded-lg p-6 bg-gray-800 border border-gray-700">
          <h3 className="text-lg font-semibold text-white mb-3">Donation Engine</h3>
          <p className="text-gray-300 text-sm">
            Zodra je balans en winst zichtbaar zijn, kunnen we hier een module tonen
            met:
          </p>
          <ul className="mt-2 text-gray-300 text-sm list-disc list-inside space-y-1">
            <li>Ingeschatte totale portefeuillewaarde</li>
            <li>Gekozen donatiepercentage (bijv. 10%)</li>
            <li>Berekeningen per week/maand</li>
          </ul>
          <p className="text-gray-400 text-xs mt-3">
            Dit is nu puur visueel. De logica kan we gekoppeld worden zodra jouw
            portefeuille echt gevuld is.
          </p>
        </div>

        <div className="rounded-lg p-6 bg-gray-800 border border-gray-700">
          <h3 className="text-lg font-semibold text-white mb-3">Safety & Trading Mode</h3>
          <ul className="text-gray-300 text-sm space-y-1">
            <li>
              · Real trading enabled:{' '}
              {status.realTradingEnabled ? '✅ YES' : '🛡️ NO (safe)'}
            </li>
            <li>
              · Trade confirmation required:{' '}
              {status.tradeConfirmationRequired ? '✅ YES' : '⚠️ NO'}
            </li>
            <li>· Current mode: {status.mode}</li>
          </ul>
          <p className="text-gray-400 text-xs mt-3">
            Pas deze instellingen alleen aan als je bewust live wilt traden. In
            read-only mode kun je wel alles simuleren en donatie-strategieën testen.
          </p>
        </div>
      </div>

      {/* Simple Sell BTC Modal */}
      {showSellModal && (
        <SimpleSellBTCModal
          isOpen={showSellModal}
          onClose={() => setShowSellModal(false)}
        />
      )}
    </div>
  );
}
