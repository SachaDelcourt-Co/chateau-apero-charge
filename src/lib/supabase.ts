
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// Define table card types
export interface TableCard {
  id: string;
  amount: number;
  description?: string;
  blocked?: boolean;
  balance?: number; // For backward compatibility
  recharge_count?: number;
  last_recharge_date?: string;
  last_payment_method?: string;
}

// Define bar product types
export interface BarProduct {
  id: string;
  name: string;
  price: number;
  category?: string;
  is_deposit?: boolean;
  is_return?: boolean;
}

// Define OrderItem type for BarOrderSummary
export interface OrderItem {
  product_name: string;
  price: number;
  quantity: number;
  is_deposit?: boolean;
  is_return?: boolean;
}

// Function to get card balance
export const getCardBalance = async (cardId: string) => {
  try {
    const { data, error } = await supabase
      .from('table_cards')
      .select('balance, blocked')
      .eq('id', cardId)
      .single();

    if (error) {
      console.error("Error fetching card balance:", error);
      throw error;
    }

    return data;
  } catch (error) {
    console.error("Error in getCardBalance:", error);
    throw error;
  }
};

// Function to get table card by ID
export const getTableCardById = async (cardId: string): Promise<TableCard | null> => {
  try {
    const { data, error } = await supabase
      .from('table_cards')
      .select('*')
      .eq('id', cardId)
      .single();

    if (error) {
      console.error("Error fetching card:", error);
      return null;
    }

    return data;
  } catch (error) {
    console.error("Error in getTableCardById:", error);
    return null;
  }
};

// Function to update card balance
export const updateCardBalance = async (cardId: string, newBalance: number) => {
  try {
    const { data, error } = await supabase
      .from('table_cards')
      .update({ balance: newBalance })
      .eq('id', cardId)
      .select();

    if (error) {
      console.error("Error updating card balance:", error);
      throw error;
    }

    return data;
  } catch (error) {
    console.error("Error in updateCardBalance:", error);
    throw error;
  }
};

// Function to update table card amount
export const updateTableCardAmount = async (cardId: string, newAmount: string): Promise<boolean> => {
  try {
    const { error } = await supabase
      .from('table_cards')
      .update({ amount: newAmount })
      .eq('id', cardId);
    
    if (error) {
      console.error("Error updating card amount:", error);
      return false;
    }
    
    return true;
  } catch (error) {
    console.error("Error in updateTableCardAmount:", error);
    return false;
  }
};

// Function to register a card transaction
export const registerCardTransaction = async (cardId: string, amount: number, transactionType: string, paymentMethod: string | null = null) => {
  try {
    const { data, error } = await supabase
      .from('card_transactions')
      .insert([{ card_id: cardId, amount: amount, transaction_type: transactionType, payment_method: paymentMethod }])
      .select();

    if (error) {
      console.error("Error registering card transaction:", error);
      throw error;
    }

    return data;
  } catch (error) {
    console.error("Error in registerCardTransaction:", error);
    throw error;
  }
};

// Function to register a payment
interface PaymentParams {
  cardId: string;
  products: Array<{ id: string; name: string; price: number; quantity: number }>;
  total: number;
  pointOfSale: string;
}

export const registerPayment = async ({ cardId, products, total, pointOfSale }: PaymentParams) => {
  try {
    // 1. Update card balance
    const cardData = await getCardBalance(cardId);
    if (!cardData) {
      throw new Error("Card not found");
    }

    if (cardData.blocked) {
      throw new Error("Card is blocked");
    }

    const newBalance = cardData.balance - total;
    if (newBalance < 0) {
      throw new Error("Insufficient balance");
    }

    await updateCardBalance(cardId, newBalance);

    // 2. Register card transaction
    await registerCardTransaction(cardId, total, 'purchase');

    // 3. Register bar order
    const { data: orderData, error: orderError } = await supabase
      .from('bar_orders')
      .insert([{ card_id: cardId, total_amount: total, point_of_sale: pointOfSale }])
      .select()
      .single();

    if (orderError) {
      console.error("Error registering bar order:", orderError);
      throw orderError;
    }

    const orderId = orderData.id;

    // 4. Register bar order items
    const orderItems = products.map(product => ({
      order_id: orderId,
      product_id: product.id,
      quantity: product.quantity,
      price: product.price
    }));

    const { error: orderItemsError } = await supabase
      .from('bar_order_items')
      .insert(orderItems);

    if (orderItemsError) {
      console.error("Error registering bar order items:", orderItemsError);
      throw orderItemsError;
    }

    return { success: true, message: "Payment registered successfully" };
  } catch (error: any) {
    console.error("Error in registerPayment:", error);
    return { success: false, message: error.message || "Failed to register payment" };
  }
};

// Function to get bar products
const barProductsCacheKey = 'bar_products';

export const getBarProducts = async (forceRefresh: boolean = false) => {
  if (!forceRefresh && sessionStorage.getItem(barProductsCacheKey)) {
    try {
      const cachedData = sessionStorage.getItem(barProductsCacheKey);
      return JSON.parse(cachedData || '[]');
    } catch (error) {
      console.error("Error parsing cached bar products, fetching from source:", error);
      sessionStorage.removeItem(barProductsCacheKey);
    }
  }

  try {
    const { data, error } = await supabase
      .from('bar_products')
      .select('*')
      .order('name', { ascending: true });

    if (error) {
      console.error("Error fetching bar products:", error);
      throw error;
    }

    sessionStorage.setItem(barProductsCacheKey, JSON.stringify(data));
    return data;
  } catch (error) {
    console.error("Error in getBarProducts:", error);
    throw error;
  }
};

// Type definitions for our statistics data
export interface UserStats {
  totalCards: number;
  averageRechargeAmount: number;
  cardReusageRate: number;
  multipleRechargeCards: number;
}

export interface FinancialStats {
  totalSales: number;
  totalRecharges: {
    cash: number;
    sumup: number;
    stripe: number;
    total: number;
  };
  averageSpendPerPerson: number;
  remainingBalance: number;
  salesByPOS: Record<string, number>;
  transactionsByTime: Array<{
    timeInterval: string;
    count: number;
    amount: number;
  }>;
  salesByPointOfSale: Array<{
    pointOfSale: string;
    count: number;
    amount: number;
  }>;
}

export interface ProductStats {
  topProducts: {
    name: string;
    quantity: number;
    revenue: number;
    category?: string;
  }[];
  salesByHour: {
    hour: number;
    sales: Record<string, number>;
  }[];
  hourlyProductSales?: {
    hour: number;
    products: Array<{
      name: string;
      quantity: number;
      revenue: number;
    }>;
  }[];
}

export interface TemporalStats {
  rushHours: {
    hour: number;
    recharges: number;
    purchases: number;
    barTransactions?: number;
    rechargeTransactions?: number;
  }[];
  avgTimeBetweenTransactions: number;
}

export interface Statistics {
  user: UserStats;
  financial: FinancialStats;
  product: ProductStats;
  temporal: TemporalStats;
}

// Get dashboard statistics
export const getDashboardStatistics = async (): Promise<Statistics> => {
  try {
    // 1. User Statistics
    const userStats = await getUserStatistics();
    
    // 2. Financial Statistics
    const financialStats = await getFinancialStatistics();
    
    // 3. Product Statistics
    const productStats = await getProductStatistics();
    
    // 4. Temporal Statistics
    const temporalStats = await getTemporalStatistics();
    
    return {
      user: userStats,
      financial: financialStats,
      product: productStats,
      temporal: temporalStats
    };
  } catch (error) {
    console.error("Error getting dashboard statistics:", error);
    throw error;
  }
};

// Get user statistics
const getUserStatistics = async (): Promise<UserStats> => {
  try {
    // Count total cards
    const { count: totalCards, error: countError } = await supabase
      .from('table_cards')
      .select('*', { count: 'exact' });
    
    if (countError) throw countError;
    
    // Calculate average recharge amount
    const { data: rechargeData, error: rechargeError } = await supabase
      .from('card_transactions')
      .select('amount')
      .eq('transaction_type', 'recharge');
    
    if (rechargeError) throw rechargeError;
    
    const totalRechargeAmount = rechargeData.reduce((sum, item) => sum + Number(item.amount), 0);
    const averageRechargeAmount = rechargeData.length > 0 ? totalRechargeAmount / rechargeData.length : 0;
    
    // Calculate card reusage rate
    const { data: reusageData, error: reusageError } = await supabase
      .from('table_cards')
      .select('id, recharge_count');
    
    if (reusageError) throw reusageError;
    
    const multipleRechargeCards = reusageData.filter(card => card.recharge_count > 1).length;
    const cardReusageRate = totalCards ? multipleRechargeCards / totalCards : 0;
    
    return {
      totalCards: totalCards || 0,
      averageRechargeAmount,
      cardReusageRate,
      multipleRechargeCards
    };
  } catch (error) {
    console.error("Error getting user statistics:", error);
    throw error;
  }
};

// Get financial statistics
const getFinancialStatistics = async (): Promise<FinancialStats> => {
  try {
    // Total sales
    const { data: salesData, error: salesError } = await supabase
      .from('bar_orders')
      .select('total_amount');
    
    if (salesError) throw salesError;
    
    const totalSales = salesData.reduce((sum, item) => sum + Number(item.total_amount), 0);
    
    // Recharges by payment method
    const { data: rechargeData, error: rechargeError } = await supabase
      .from('card_transactions')
      .select('amount, payment_method')
      .eq('transaction_type', 'recharge');
    
    if (rechargeError) throw rechargeError;
    
    const totalRechargesByCash = rechargeData
      .filter(item => item.payment_method === 'cash')
      .reduce((sum, item) => sum + Number(item.amount), 0);
      
    const totalRechargesBySumup = rechargeData
      .filter(item => item.payment_method === 'sumup')
      .reduce((sum, item) => sum + Number(item.amount), 0);
      
    const totalRechargesByStripe = rechargeData
      .filter(item => item.payment_method === 'stripe')
      .reduce((sum, item) => sum + Number(item.amount), 0);
    
    // Average spend per person
    const { data: cardsData, error: cardsError } = await supabase
      .from('table_cards')
      .select('id');
    
    if (cardsError) throw cardsError;
    
    const averageSpendPerPerson = cardsData.length > 0 ? totalSales / cardsData.length : 0;
    
    // Remaining balance
    const { data: balanceData, error: balanceError } = await supabase
      .from('table_cards')
      .select('balance');
    
    if (balanceError) throw balanceError;
    
    const remainingBalance = balanceData.reduce((sum, item) => sum + Number(item.balance), 0);
    
    // Sales by POS
    const { data: posSalesData, error: posError } = await supabase
      .from('bar_orders')
      .select('total_amount, point_of_sale');
    
    if (posError) throw posError;
    
    const salesByPOS: Record<string, number> = {};
    posSalesData.forEach(item => {
      const pos = String(item.point_of_sale || 1);
      salesByPOS[pos] = (salesByPOS[pos] || 0) + Number(item.total_amount);
    });
    
    // Transactions by time
    const { data: timeData, error: timeError } = await supabase
      .from('card_transactions')
      .select('amount, created_at, transaction_type');
    
    if (timeError) throw timeError;
    
    // Group by 30-minute intervals
    const transactionsByTime: Array<{timeInterval: string; count: number; amount: number}> = [];
    const timeIntervals = new Map<string, {count: number; amount: number}>();
    
    timeData.forEach(transaction => {
      if (!transaction.created_at) return;
      
      const date = new Date(transaction.created_at);
      const hour = date.getHours();
      const minutes = Math.floor(date.getMinutes() / 30) * 30;
      const timeKey = `${hour}:${minutes === 0 ? '00' : minutes}`;
      
      if (!timeIntervals.has(timeKey)) {
        timeIntervals.set(timeKey, { count: 0, amount: 0 });
      }
      
      const interval = timeIntervals.get(timeKey)!;
      interval.count += 1;
      interval.amount += Number(transaction.amount);
    });
    
    // Convert to array format
    for (const [timeInterval, data] of timeIntervals.entries()) {
      transactionsByTime.push({
        timeInterval,
        count: data.count,
        amount: data.amount
      });
    }
    
    // Sort by time
    transactionsByTime.sort((a, b) => {
      const [aHour, aMin] = a.timeInterval.split(':').map(Number);
      const [bHour, bMin] = b.timeInterval.split(':').map(Number);
      return (aHour * 60 + aMin) - (bHour * 60 + bMin);
    });
    
    // Sales by point of sale
    const salesByPointOfSale = Object.entries(salesByPOS).map(([pos, amount]) => {
      // Count transactions for this POS
      const posTransactions = posSalesData.filter(item => String(item.point_of_sale || 1) === pos).length;
      
      return {
        pointOfSale: pos,
        count: posTransactions,
        amount: amount
      };
    });
    
    return {
      totalSales,
      totalRecharges: {
        cash: totalRechargesByCash,
        sumup: totalRechargesBySumup,
        stripe: totalRechargesByStripe,
        total: totalRechargesByCash + totalRechargesBySumup + totalRechargesByStripe
      },
      averageSpendPerPerson,
      remainingBalance,
      salesByPOS,
      transactionsByTime,
      salesByPointOfSale
    };
  } catch (error) {
    console.error("Error getting financial statistics:", error);
    throw error;
  }
};

// Get product statistics
const getProductStatistics = async (): Promise<ProductStats> => {
  try {
    // Top products by sales
    const { data: orderItemsData, error: orderItemsError } = await supabase
      .from('bar_order_items')
      .select(`
        quantity,
        product_id,
        price,
        bar_orders!inner(created_at)
      `);
    
    if (orderItemsError) throw orderItemsError;
    
    // Get product names
    const { data: productsData, error: productsError } = await supabase
      .from('bar_products')
      .select('id, name, category');
    
    if (productsError) throw productsError;
    
    const productMap = new Map();
    const categoryMap = new Map();
    productsData.forEach(product => {
      productMap.set(product.id, product.name);
      categoryMap.set(product.id, product.category || 'Non catégorisé');
    });
    
    // Calculate top products
    const productStats = new Map();
    orderItemsData.forEach(item => {
      const productId = item.product_id;
      const productName = productMap.get(productId) || `Product ${productId}`;
      const category = categoryMap.get(productId);
      const quantity = item.quantity;
      const revenue = quantity * item.price;
      
      if (!productStats.has(productId)) {
        productStats.set(productId, {
          name: productName,
          quantity: 0,
          revenue: 0,
          category: category
        });
      }
      
      const currentStats = productStats.get(productId);
      currentStats.quantity += quantity;
      currentStats.revenue += revenue;
      productStats.set(productId, currentStats);
    });
    
    const topProducts = Array.from(productStats.values())
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 10);
    
    // Sales by hour
    const salesByHour: { hour: number; sales: Record<string, number> }[] = [];
    const hourlyProductSales = new Map<number, Map<string, number>>();
    
    // Parse created_at from orders and group by hour
    orderItemsData.forEach(item => {
      if (!item.bar_orders || !item.bar_orders.created_at) return;
      
      const orderDate = new Date(item.bar_orders.created_at);
      const hour = orderDate.getHours();
      const productId = item.product_id;
      const productName = productMap.get(productId) || `Product ${productId}`;
      const revenue = item.quantity * item.price;
      
      if (!hourlyProductSales.has(hour)) {
        hourlyProductSales.set(hour, new Map<string, number>());
      }
      
      const hourData = hourlyProductSales.get(hour)!;
      hourData.set(productName, (hourData.get(productName) || 0) + revenue);
    });
    
    // Convert to desired format
    for (let i = 0; i < 24; i++) {
      const hourData = hourlyProductSales.get(i) || new Map<string, number>();
      const salesObj: Record<string, number> = {};
      
      hourData.forEach((value, key) => {
        salesObj[key] = value;
      });
      
      salesByHour.push({
        hour: i,
        sales: salesObj
      });
    }
    
    return {
      topProducts,
      salesByHour,
      hourlyProductSales: Array.from(hourlyProductSales.entries()).map(([hour, productsMap]) => ({
        hour,
        products: Array.from(productsMap.entries()).map(([name, revenue]) => ({
          name,
          quantity: 1, // Default as we only have revenue data
          revenue
        }))
      }))
    };
  } catch (error) {
    console.error("Error getting product statistics:", error);
    throw error;
  }
};

// Get temporal statistics
const getTemporalStatistics = async (): Promise<TemporalStats> => {
  try {
    // Rush hours data
    const { data: transactionsData, error: transactionsError } = await supabase
      .from('card_transactions')
      .select('created_at, transaction_type');
    
    if (transactionsError) throw transactionsError;
    
    const hourCounts = new Map<number, { recharges: number; purchases: number }>();
    
    // Initialize all hours
    for (let i = 0; i < 24; i++) {
      hourCounts.set(i, { recharges: 0, purchases: 0 });
    }
    
    // Count transactions by hour
    transactionsData.forEach(transaction => {
      if (!transaction.created_at) return;
      
      const date = new Date(transaction.created_at);
      const hour = date.getHours();
      const hourData = hourCounts.get(hour)!;
      
      if (transaction.transaction_type === 'recharge') {
        hourData.recharges++;
      } else {
        hourData.purchases++;
      }
      
      hourCounts.set(hour, hourData);
    });
    
    const rushHours = Array.from(hourCounts.entries())
      .map(([hour, data]) => ({
        hour,
        recharges: data.recharges,
        purchases: data.purchases,
        // Add these for backward compatibility
        barTransactions: data.purchases,
        rechargeTransactions: data.recharges
      }))
      .sort((a, b) => (b.recharges + b.purchases) - (a.recharges + a.purchases));
    
    // Calculate average time between transactions per card
    const { data: cardData, error: cardError } = await supabase
      .from('card_transactions')
      .select('card_id, created_at')
      .order('created_at', { ascending: true });
    
    if (cardError) throw cardError;
    
    // Group transactions by card
    const cardTransactions = new Map<string, Date[]>();
    
    if (cardData && Array.isArray(cardData)) {
      cardData.forEach((transaction: any) => {
        if (!transaction.created_at || !transaction.card_id) return;
        
        const cardId = transaction.card_id;
        if (!cardTransactions.has(cardId)) {
          cardTransactions.set(cardId, []);
        }
        cardTransactions.get(cardId)!.push(new Date(transaction.created_at));
      });
    }
    
    // Calculate average times
    let totalTimeDiff = 0;
    let totalPairs = 0;
    
    cardTransactions.forEach(transactions => {
      if (transactions.length < 2) return;
      
      for (let i = 1; i < transactions.length; i++) {
        const timeDiff = transactions[i].getTime() - transactions[i-1].getTime();
        totalTimeDiff += timeDiff;
        totalPairs++;
      }
    });
    
    // Convert milliseconds to minutes
    const avgTimeBetweenTransactions = totalPairs ? totalTimeDiff / totalPairs / (1000 * 60) : 0;
    
    return {
      rushHours,
      avgTimeBetweenTransactions
    };
  } catch (error) {
    console.error("Error getting temporal statistics:", error);
    throw error;
  }
};
