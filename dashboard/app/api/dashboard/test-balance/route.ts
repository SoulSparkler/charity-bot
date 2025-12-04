import { NextRequest, NextResponse } from 'next/server';
import { krakenService } from '@/services/krakenService';

export async function GET(request: NextRequest) {
  try {
    console.log('🔍 Testing Kraken API connection...');
    
    // Test API connectivity
    const connectionTest = await krakenService.testConnection();
    if (!connectionTest.success) {
      return NextResponse.json(
        { 
          success: false,
          error: 'Connection test failed',
          details: connectionTest.message,
          instructions: [
            '1. Check that KRAKEN_API_KEY and KRAKEN_API_SECRET are set in environment',
            '2. Ensure USE_MOCK_KRAKEN=false to use real API',
            '3. Verify API key has correct permissions on Kraken',
            '4. Check network connectivity to api.kraken.com'
          ]
        },
        { status: 500 }
      );
    }

    // Test balance access (read-only operation)
    const balanceTest = await krakenService.testBalanceAccess();
    
    // Get service status
    const status = krakenService.getStatus();
    
    // Response with all test results
    const response = {
      success: true,
      message: 'Kraken API connection test completed',
      tests: {
        connection: connectionTest,
        balance: balanceTest,
        status: status
      },
      summary: {
        mode: status.mode,
        apiConfigured: status.apiKeyConfigured && status.apiSecretConfigured,
        canReadBalance: balanceTest.success,
        safeForReadOnly: status.mode === 'testing' || !status.realTradingEnabled,
        readyForTrading: status.realTradingEnabled && !status.tradeConfirmationRequired
      },
      recommendations: [
        ...(status.mockMode ? ['Current mode is MOCK - set USE_MOCK_KRAKEN=false for real data'] : []),
        ...(status.mode === 'read-only' ? ['Ready for read-only operations - add funds to test'] : []),
        ...(status.realTradingEnabled ? ['⚠️ REAL TRADING ENABLED - This bot can place real orders!'] : []),
        ...(status.tradeConfirmationRequired ? ['Trade confirmation required - safe mode enabled'] : []),
        ...(!status.apiKeyConfigured ? ['API key not configured - set KRAKEN_API_KEY environment variable'] : []),
        ...(!status.apiSecretConfigured ? ['API secret not configured - set KRAKEN_API_SECRET environment variable'] : [])
      ]
    };

    console.log('✅ Kraken API test completed:', response.summary);
    
    return NextResponse.json(response);
    
  } catch (error) {
    console.error('❌ Kraken API test failed:', error);
    
    return NextResponse.json(
      { 
        success: false,
        error: 'API test failed',
        message: (error as Error).message,
        troubleshooting: [
          'Check environment variables are loaded',
          'Verify Kraken API credentials',
          'Ensure API key has query permissions',
          'Check network connectivity'
        ]
      },
      { status: 500 }
    );
  }
}