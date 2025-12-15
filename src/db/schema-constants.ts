/**
 * Canonical Bot State Schema Definition
 * 
 * This file defines the authoritative list of required columns for the bot_state table.
 * All bot code must reference only columns defined here, and all migrations must
 * ensure these columns exist before allowing any bot operations.
 */

export interface BotStateColumn {
  name: string;
  type: string;
  nullable: boolean;
  default?: string | number | boolean;
  description: string;
}

/**
 * Canonical list of all required bot_state columns
 * This must be kept in sync with actual database schema
 */
export const BOT_STATE_REQUIRED_COLUMNS: BotStateColumn[] = [
  {
    name: 'id',
    type: 'UUID',
    nullable: false,
    default: 'uuid_generate_v4()',
    description: 'Primary key'
  },
  {
    name: 'bot_a_virtual_usd',
    type: 'NUMERIC(12, 2)',
    nullable: false,
    default: 230.00,
    description: 'Bot A virtual USD balance'
  },
  {
    name: 'bot_b_virtual_usd',
    type: 'NUMERIC(12, 2)',
    nullable: false,
    default: 0.00,
    description: 'Bot B virtual USD balance'
  },
  {
    name: 'bot_a_cycle_number',
    type: 'INTEGER',
    nullable: false,
    default: 1,
    description: 'Current cycle number for Bot A'
  },
  {
    name: 'bot_a_cycle_target',
    type: 'NUMERIC(12, 2)',
    nullable: false,
    default: 200.00,
    description: 'Target USD amount for Bot A cycle completion'
  },
  {
    name: 'bot_b_enabled',
    type: 'BOOLEAN',
    nullable: false,
    default: false,
    description: 'Whether Bot B is enabled for trading'
  },
  {
    name: 'bot_b_triggered',
    type: 'BOOLEAN',
    nullable: false,
    default: false,
    description: 'Whether Bot B has been triggered by Bot A'
  },
  {
    name: 'last_reset',
    type: 'TIMESTAMP WITH TIME ZONE',
    nullable: false,
    default: 'NOW()',
    description: 'Last time the bot state was reset'
  },
  {
    name: 'created_at',
    type: 'TIMESTAMP WITH TIME ZONE',
    nullable: false,
    default: 'NOW()',
    description: 'Record creation timestamp'
  },
  {
    name: 'updated_at',
    type: 'TIMESTAMP WITH TIME ZONE',
    nullable: false,
    default: 'NOW()',
    description: 'Record last update timestamp'
  },
  {
    name: 'monthly_start_balance',
    type: 'NUMERIC(12, 2)',
    nullable: false,
    default: 0.00,
    description: 'Bot B monthly starting balance for donation calculation'
  },
  {
    name: 'last_month_reset',
    type: 'TIMESTAMP WITH TIME ZONE',
    nullable: false,
    default: 'NOW()',
    description: 'Last time Bot B monthly cycle was reset'
  }
];

/**
 * Get column names only (for verification queries)
 */
export const BOT_STATE_COLUMN_NAMES = BOT_STATE_REQUIRED_COLUMNS.map(col => col.name);

/**
 * TypeScript interfaces that must match the canonical schema
 */
export interface BotAState {
  id: string;
  bot_a_virtual_usd: number;
  bot_b_virtual_usd: number;
  bot_a_cycle_number: number;
  bot_a_cycle_target: number;
  bot_b_enabled: boolean;
  bot_b_triggered: boolean;
  last_reset: Date;
}

export interface BotBState {
  id: string;
  bot_b_virtual_usd: number;
  monthly_start_balance: number;
  last_month_reset: Date;
}

/**
 * Validation function to ensure schema completeness
 */
export function validateBotStateSchema(columns: string[]): { isValid: boolean; missingColumns: string[] } {
  const missingColumns = BOT_STATE_COLUMN_NAMES.filter(col => !columns.includes(col));
  return {
    isValid: missingColumns.length === 0,
    missingColumns
  };
}

/**
 * Generate CREATE TABLE statement from canonical schema
 */
export function generateCreateTableSQL(): string {
  const columns = BOT_STATE_REQUIRED_COLUMNS.map(col => {
    const defaultClause = col.default ? ` DEFAULT ${col.default}` : '';
    return `    ${col.name} ${col.type} NOT NULL${defaultClause}`;
  }).join(',\n');

  return `CREATE TABLE IF NOT EXISTS bot_state (
${columns},
    PRIMARY KEY (id)
);`;
}

/**
 * Generate INSERT statement for initial data
 */
export function generateInitialInsertSQL(): string {
  const columns = ['bot_a_virtual_usd', 'bot_b_virtual_usd', 'bot_a_cycle_number', 'bot_a_cycle_target', 'bot_b_enabled', 'bot_b_triggered'];
  const values = [230.00, 0.00, 1, 200.00, false, false];
  
  return `INSERT INTO bot_state (${columns.join(', ')})
SELECT ${values.join(', ')}
WHERE NOT EXISTS (SELECT 1 FROM bot_state);`;
}