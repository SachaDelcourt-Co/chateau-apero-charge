import { createClient } from '@supabase/supabase-js';

// We use the values from the Supabase integration
const supabaseUrl = "https://dqghjrpeoyqvkvoivfnz.supabase.co";
const supabaseAnonKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRxZ2hqcnBlb3lxdmt2b2l2Zm56Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDQwMjE5MDgsImV4cCI6MjA1OTU5NzkwOH0.zzvFJVZ_b4zFe54eTY2iuE0ce-AkhdjjLWewSDoFu-Y";

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: localStorage,
    persistSession: true,
    autoRefreshToken: true,
  }
});

export interface TableCard {
  id: string;
  amount: string | number;
  description?: string | null;
  last_payment_method?: string | null;
  recharge_count?: number | null;
  last_recharge_date?: string | null;
}

// For backward compatibility, keep the Card interface but modify the implementation
export interface Card {
  card_number: string;
  qr_code_file?: string | null;
  url?: string | null;
  amount?: string | null;
}

export async function getCardById(cardNumber: string): Promise<Card | null> {
  console.log(`Recherche de la carte avec numéro: ${cardNumber}`);
  
  try {
    // Try to find the card in table_cards
    const { data, error } = await supabase
      .from('table_cards')
      .select('*')
      .eq('id', cardNumber)
      .maybeSingle();

    if (error) {
      console.error('Error fetching card:', error);
      return null;
    }
    
    if (data) {
      // Convert from table_cards format to Card format
      return {
        card_number: data.id,
        amount: data.amount?.toString(),
      };
    }

    console.log('Aucune carte trouvée avec ce numéro');
    return null;
  } catch (error) {
    console.error('Exception lors de la récupération de la carte:', error);
    return null;
  }
}

export async function updateCardAmount(cardNumber: string, amount: string): Promise<boolean> {
  const { error } = await supabase
    .from('table_cards')
    .update({ amount })
    .eq('id', cardNumber);

  if (error) {
    console.error('Error updating card amount:', error);
    return false;
  }

  return true;
}

// Functions for table_cards

export async function getTableCardById(id: string): Promise<TableCard | null> {
  console.log(`Recherche de la carte avec ID: ${id}`);
  
  try {
    const { data, error } = await supabase
      .from('table_cards')
      .select('*')
      .eq('id', id)
      .maybeSingle();

    if (error) {
      console.error('Error fetching card from table_cards:', error);
      return null;
    }

    console.log('Réponse de Supabase (table_cards):', data);
    return data;
  } catch (error) {
    console.error('Exception lors de la récupération de la carte (table_cards):', error);
    return null;
  }
}

export async function updateTableCardAmount(id: string, amount: string): Promise<boolean> {
  const { error } = await supabase
    .from('table_cards')
    .update({ amount })
    .eq('id', id);

  if (error) {
    console.error('Error updating table_card amount:', error);
    return false;
  }

  return true;
}

// Bar page specific functions
export interface BarProduct {
  id: number;
  name: string;
  price: number;
  category: string | null;
  is_deposit: boolean;
  is_return: boolean;
}

export interface OrderItem {
  product_name: string;
  price: number;
  quantity: number;
  is_deposit: boolean;
  is_return: boolean;
}

export interface BarOrder {
  id?: string;
  card_id: string;
  total_amount: number;
  created_at?: string;
  status?: string;
  items: OrderItem[];
  point_of_sale?: number;
}

// Cache des produits pour optimiser les performances
let barProductsCache: BarProduct[] = [];
let lastFetchTime: number = 0;
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes en millisecondes

export async function getBarProducts(forceRefresh: boolean = false): Promise<BarProduct[]> {
  const now = Date.now();
  
  // Si on force le rafraîchissement ou si le cache est expiré, on récupère les données
  if (forceRefresh || barProductsCache.length === 0 || (now - lastFetchTime) > CACHE_TTL) {
    try {
      console.log(`Récupération des produits depuis Supabase (${forceRefresh ? 'forcé' : 'cache expiré'})`);
      
      const { data, error } = await supabase
        .from('bar_products')
        .select('*')
        .order('category', { ascending: true })
        .order('name', { ascending: true });

      if (error) {
        console.error('Error fetching bar products:', error);
        // En cas d'erreur, retourner le cache actuel s'il existe
        return barProductsCache.length > 0 ? barProductsCache : [];
      }

      // Mettre à jour le cache et l'horodatage
      barProductsCache = data || [];
      lastFetchTime = now;
      
      console.log(`${barProductsCache.length} produits récupérés et mis en cache`);
      return barProductsCache;
    } catch (error) {
      console.error('Exception lors de la récupération des produits:', error);
      // En cas d'erreur, retourner le cache actuel s'il existe
      return barProductsCache.length > 0 ? barProductsCache : [];
    }
  } else {
    console.log(`Utilisation des ${barProductsCache.length} produits en cache`);
    return barProductsCache;
  }
}

export async function createBarOrder(order: BarOrder): Promise<{ success: boolean; orderId?: string }> {
  try {
    console.log("Processing order:", order);
    console.log("Total amount to charge:", order.total_amount);
    
    // Start a transaction by beginning a single batch
    // 1. First get the current card amount to make sure it has enough balance
    const { data: cardData, error: cardError } = await supabase
      .from('table_cards')
      .select('amount')
      .eq('id', order.card_id)
      .maybeSingle();

    if (cardError || !cardData) {
      console.error('Error fetching card data:', cardError);
      return { success: false };
    }

    const currentAmount = parseFloat(cardData.amount || '0');
    if (currentAmount < order.total_amount) {
      console.error('Insufficient funds:', currentAmount, 'required:', order.total_amount);
      return { success: false };
    }

    // 2. Create the order
    const { data: orderData, error: orderError } = await supabase
      .from('bar_orders')
      .insert({
        card_id: order.card_id,
        total_amount: order.total_amount,
        status: 'completed'
      })
      .select()
      .single();

    if (orderError) {
      console.error('Error creating bar order:', orderError);
      return { success: false };
    }

    // 3. Add all the order items
    const orderItems = order.items.map(item => ({
      order_id: orderData.id,
      product_name: item.product_name,
      price: item.price,
      quantity: item.quantity,
      is_deposit: item.is_deposit,
      is_return: item.is_return
    }));

    const { error: itemsError } = await supabase
      .from('bar_order_items')
      .insert(orderItems);

    if (itemsError) {
      console.error('Error creating order items:', itemsError);
      // Even if we fail here, we still want to update the card amount
      // since the order was created
    }

    // 4. Update the card amount
    const newAmount = (currentAmount - order.total_amount).toString();
    console.log("Updating card amount from:", currentAmount, "to:", newAmount);
    
    const { error: updateError } = await supabase
      .from('table_cards')
      .update({ amount: newAmount })
      .eq('id', order.card_id);

    if (updateError) {
      console.error('Error updating card amount:', updateError);
      return { success: false };
    }

    // Supprimer le cache des produits pour forcer un rafraîchissement lors de la prochaine requête
    barProductsCache = [];

    return { success: true, orderId: orderData.id };
  } catch (error) {
    console.error('Exception lors de la création de la commande:', error);
    return { success: false };
  }
}

// New statistics functions for admin dashboard
export interface Statistics {
  user: UserStats;
  financial: FinancialStats;
  product: ProductStats;
  temporal: TemporalStats;
}

export interface UserStats {
  totalCards: number;
  averageRechargeAmount: number;
  cardReusageRate: number;
  multipleRechargeCards: number;
}

export interface FinancialStats {
  totalSales: number;
  totalRecharges: {
    total: number;
    cash: number;
    sumup: number;
    stripe: number;
  };
  averageSpendPerPerson: number;
  totalRemainingBalance: number;
  transactionsByTime: {
    timeInterval: string;
    count: number;
    amount: number;
  }[];
  salesByPointOfSale: {
    pointOfSale: number;
    count: number;
    amount: number;
  }[];
}

export interface ProductStats {
  topProducts: {
    name: string;
    category: string | null;
    quantity: number;
    revenue: number;
  }[];
  hourlyProductSales: {
    hour: string;
    products: {
      name: string;
      quantity: number;
      revenue: number;
    }[];
  }[];
}

export interface TemporalStats {
  rushHours: {
    hour: string;
    rechargeTransactions: number;
    barTransactions: number;
  }[];
  averageTimeBetweenTransactions: number;
}

// Get all statistics data
export async function getDashboardStatistics(): Promise<Statistics> {
  try {
    console.log('Fetching dashboard statistics...');
    
    // Fetch user statistics
    const userStats = await getUserStatistics();
    
    // Fetch financial statistics
    const financialStats = await getFinancialStatistics();
    
    // Fetch product statistics
    const productStats = await getProductStatistics();
    
    // Fetch temporal statistics
    const temporalStats = await getTemporalStatistics();
    
    return {
      user: userStats,
      financial: financialStats,
      product: productStats,
      temporal: temporalStats
    };
  } catch (error) {
    console.error('Error fetching dashboard statistics:', error);
    
    // Return default empty statistics
    return {
      user: {
        totalCards: 0,
        averageRechargeAmount: 0,
        cardReusageRate: 0,
        multipleRechargeCards: 0
      },
      financial: {
        totalSales: 0,
        totalRecharges: {
          total: 0,
          cash: 0,
          sumup: 0,
          stripe: 0
        },
        averageSpendPerPerson: 0,
        totalRemainingBalance: 0,
        transactionsByTime: [],
        salesByPointOfSale: []
      },
      product: {
        topProducts: [],
        hourlyProductSales: []
      },
      temporal: {
        rushHours: [],
        averageTimeBetweenTransactions: 0
      }
    };
  }
}

// Get user statistics
async function getUserStatistics(): Promise<UserStats> {
  try {
    // Get total number of cards
    const { count: totalCards, error: countError } = await supabase
      .from('table_cards')
      .select('*', { count: 'exact', head: true });
      
    if (countError) throw countError;
    
    // Get cards with multiple recharges
    const { data: multipleRechargeCardsData, error: rechargeError } = await supabase
      .from('table_cards')
      .select('id')
      .gt('recharge_count', 1);
      
    if (rechargeError) throw rechargeError;
    
    const multipleRechargeCards = multipleRechargeCardsData?.length || 0;
    
    // Get average recharge amount
    const { data: recharges, error: avgRechargeError } = await supabase
      .from('card_transactions')
      .select('amount')
      .eq('transaction_type', 'recharge');
      
    if (avgRechargeError) throw avgRechargeError;
    
    let averageRechargeAmount = 0;
    if (recharges && recharges.length > 0) {
      const total = recharges.reduce((sum, transaction) => sum + parseFloat(transaction.amount.toString()), 0);
      averageRechargeAmount = total / recharges.length;
    }
    
    // Calculate card reusage rate (cards with >1 recharge / total cards)
    const cardReusageRate = totalCards ? (multipleRechargeCards / totalCards) : 0;
    
    return {
      totalCards: totalCards || 0,
      averageRechargeAmount,
      cardReusageRate,
      multipleRechargeCards
    };
  } catch (error) {
    console.error('Error fetching user statistics:', error);
    return {
      totalCards: 0,
      averageRechargeAmount: 0,
      cardReusageRate: 0,
      multipleRechargeCards: 0
    };
  }
}

// Get financial statistics
async function getFinancialStatistics(): Promise<FinancialStats> {
  try {
    // Get total sales
    const { data: salesData, error: salesError } = await supabase
      .from('bar_orders')
      .select('total_amount');
      
    if (salesError) throw salesError;
    
    const totalSales = salesData 
      ? salesData.reduce((sum, order) => sum + parseFloat(order.total_amount.toString()), 0)
      : 0;
    
    // Get recharges by payment method
    const { data: rechargeData, error: rechargeError } = await supabase
      .from('card_transactions')
      .select('amount, payment_method')
      .eq('transaction_type', 'recharge');
      
    if (rechargeError) throw rechargeError;
    
    const totalRecharges = {
      total: 0,
      cash: 0,
      sumup: 0,
      stripe: 0
    };
    
    if (rechargeData) {
      rechargeData.forEach(transaction => {
        const amount = parseFloat(transaction.amount.toString());
        totalRecharges.total += amount;
        
        if (transaction.payment_method === 'cash') {
          totalRecharges.cash += amount;
        } else if (transaction.payment_method === 'sumup') {
          totalRecharges.sumup += amount;
        } else if (transaction.payment_method === 'stripe') {
          totalRecharges.stripe += amount;
        }
      });
    }
    
    // Get average spend per person
    const { data: distinctUsers, error: distinctUsersError } = await supabase
      .from('bar_orders')
      .select('card_id')
      .is('card_id', 'not.null');
      
    if (distinctUsersError) throw distinctUsersError;
    
    // Count unique card_ids
    const uniqueCardIds = new Set();
    distinctUsers?.forEach(order => {
      if (order.card_id) uniqueCardIds.add(order.card_id);
    });
    
    const averageSpendPerPerson = uniqueCardIds.size > 0 ? totalSales / uniqueCardIds.size : 0;
    
    // Get total remaining balance
    const { data: cardsData, error: cardsError } = await supabase
      .from('table_cards')
      .select('amount');
      
    if (cardsError) throw cardsError;
    
    const totalRemainingBalance = cardsData 
      ? cardsData.reduce((sum, card) => sum + parseFloat(card.amount?.toString() || '0'), 0)
      : 0;
    
    // Get transactions by time interval (30 min intervals)
    const { data: timeData, error: timeError } = await supabase
      .from('bar_orders')
      .select('created_at, total_amount')
      .order('created_at', { ascending: true });
      
    if (timeError) throw timeError;
    
    // Group by 30 minute intervals
    const transactionsByTime = [];
    if (timeData) {
      const timeIntervals = new Map();
      
      timeData.forEach(order => {
        const date = new Date(order.created_at || '');
        // Round to nearest 30 minutes
        date.setMinutes(Math.floor(date.getMinutes() / 30) * 30);
        date.setSeconds(0);
        date.setMilliseconds(0);
        
        const timeKey = date.toISOString();
        const displayTime = `${date.getHours()}:${date.getMinutes() === 0 ? '00' : '30'}`;
        
        if (!timeIntervals.has(timeKey)) {
          timeIntervals.set(timeKey, {
            timeInterval: displayTime,
            count: 0,
            amount: 0
          });
        }
        
        const interval = timeIntervals.get(timeKey);
        interval.count += 1;
        interval.amount += parseFloat(order.total_amount.toString());
      });
      
      timeIntervals.forEach(interval => {
        transactionsByTime.push(interval);
      });
      
      // Sort by time
      transactionsByTime.sort((a, b) => {
        const [aHours, aMinutes] = a.timeInterval.split(':').map(Number);
        const [bHours, bMinutes] = b.timeInterval.split(':').map(Number);
        
        if (aHours !== bHours) {
          return aHours - bHours;
        }
        return aMinutes - bMinutes;
      });
    }
    
    // Get sales by point of sale
    const { data: posData, error: posError } = await supabase
      .from('bar_orders')
      .select('point_of_sale, total_amount');
      
    if (posError) throw posError;
    
    const salesByPointOfSale = [];
    if (posData) {
      const posSales = new Map();
      
      posData.forEach(order => {
        const pos = order.point_of_sale || 1;
        
        if (!posSales.has(pos)) {
          posSales.set(pos, {
            pointOfSale: pos,
            count: 0,
            amount: 0
          });
        }
        
        const posStat = posSales.get(pos);
        posStat.count += 1;
        posStat.amount += parseFloat(order.total_amount.toString());
      });
      
      posSales.forEach(posStat => {
        salesByPointOfSale.push(posStat);
      });
      
      // Sort by point of sale
      salesByPointOfSale.sort((a, b) => a.pointOfSale - b.pointOfSale);
    }
    
    return {
      totalSales,
      totalRecharges,
      averageSpendPerPerson,
      totalRemainingBalance,
      transactionsByTime,
      salesByPointOfSale
    };
  } catch (error) {
    console.error('Error fetching financial statistics:', error);
    return {
      totalSales: 0,
      totalRecharges: {
        total: 0,
        cash: 0,
        sumup: 0,
        stripe: 0
      },
      averageSpendPerPerson: 0,
      totalRemainingBalance: 0,
      transactionsByTime: [],
      salesByPointOfSale: []
    };
  }
}

// Get product statistics
async function getProductStatistics(): Promise<ProductStats> {
  try {
    // Get order items with order created_at
    const { data: orderItemsData, error: orderItemsError } = await supabase
      .from('bar_order_items')
      .select(`
        product_name,
        price,
        quantity,
        order_id,
        bar_orders!inner(created_at)
      `);
      
    if (orderItemsError) throw orderItemsError;
    
    // Get products for categories
    const { data: productsData, error: productsError } = await supabase
      .from('bar_products')
      .select('name, category');
      
    if (productsError) throw productsError;
    
    // Create product name to category map
    const productCategories = new Map();
    if (productsData) {
      productsData.forEach(product => {
        productCategories.set(product.name, product.category);
      });
    }
    
    // Process top products
    const productStats = new Map();
    if (orderItemsData) {
      orderItemsData.forEach(item => {
        const productName = item.product_name;
        
        if (!productStats.has(productName)) {
          productStats.set(productName, {
            name: productName,
            category: productCategories.get(productName) || null,
            quantity: 0,
            revenue: 0
          });
        }
        
        const stats = productStats.get(productName);
        stats.quantity += item.quantity;
        stats.revenue += item.price * item.quantity;
      });
    }
    
    const topProducts = Array.from(productStats.values())
      .sort((a, b) => b.revenue - a.revenue);
    
    // Process hourly product sales
    const hourlyProductSales = [];
    if (orderItemsData) {
      const hourlyData = new Map();
      
      orderItemsData.forEach(item => {
        const createdAt = new Date(item.bar_orders.created_at);
        const hour = createdAt.getHours();
        const hourKey = `${hour}:00`;
        
        if (!hourlyData.has(hourKey)) {
          hourlyData.set(hourKey, {
            hour: hourKey,
            products: new Map()
          });
        }
        
        const hourData = hourlyData.get(hourKey);
        const productName = item.product_name;
        
        if (!hourData.products.has(productName)) {
          hourData.products.set(productName, {
            name: productName,
            quantity: 0,
            revenue: 0
          });
        }
        
        const productData = hourData.products.get(productName);
        productData.quantity += item.quantity;
        productData.revenue += item.price * item.quantity;
      });
      
      // Convert to array format
      hourlyData.forEach((hourData, hourKey) => {
        hourlyProductSales.push({
          hour: hourKey,
          products: Array.from(hourData.products.values())
            .sort((a, b) => b.revenue - a.revenue)
        });
      });
      
      // Sort by hour
      hourlyProductSales.sort((a, b) => {
        const aHour = parseInt(a.hour.split(':')[0]);
        const bHour = parseInt(b.hour.split(':')[0]);
        return aHour - bHour;
      });
    }
    
    return {
      topProducts,
      hourlyProductSales
    };
  } catch (error) {
    console.error('Error fetching product statistics:', error);
    return {
      topProducts: [],
      hourlyProductSales: []
    };
  }
}

// Get temporal statistics
async function getTemporalStatistics(): Promise<TemporalStats> {
  try {
    // Get rush hours (transactions per hour)
    const { data: barTransactions, error: barError } = await supabase
      .from('bar_orders')
      .select('created_at');
      
    if (barError) throw barError;
    
    const { data: rechargeTransactions, error: rechargeError } = await supabase
      .from('card_transactions')
      .select('created_at')
      .eq('transaction_type', 'recharge');
      
    if (rechargeError) throw rechargeError;
    
    const rushHours = [];
    if (barTransactions && rechargeTransactions) {
      const hourData = new Map();
      
      // Process bar transactions
      barTransactions.forEach(transaction => {
        const date = new Date(transaction.created_at);
        const hour = date.getHours();
        const hourKey = `${hour}:00`;
        
        if (!hourData.has(hourKey)) {
          hourData.set(hourKey, {
            hour: hourKey,
            barTransactions: 0,
            rechargeTransactions: 0
          });
        }
        
        hourData.get(hourKey).barTransactions += 1;
      });
      
      // Process recharge transactions
      rechargeTransactions.forEach(transaction => {
        const date = new Date(transaction.created_at);
        const hour = date.getHours();
        const hourKey = `${hour}:00`;
        
        if (!hourData.has(hourKey)) {
          hourData.set(hourKey, {
            hour: hourKey,
            barTransactions: 0,
            rechargeTransactions: 0
          });
        }
        
        hourData.get(hourKey).rechargeTransactions += 1;
      });
      
      // Convert to array and sort by hour
      hourData.forEach(data => {
        rushHours.push(data);
      });
      
      rushHours.sort((a, b) => {
        const aHour = parseInt(a.hour.split(':')[0]);
        const bHour = parseInt(b.hour.split(':')[0]);
        return aHour - bHour;
      });
    }
    
    // Calculate average time between transactions per card
    let averageTimeBetweenTransactions = 0;
    if (barTransactions) {
      // Group transactions by card_id
      const cardTransactions = new Map();
      
      barTransactions.forEach(transaction => {
        const cardId = transaction.card_id;
        
        if (cardId && !cardTransactions.has(cardId)) {
          cardTransactions.set(cardId, []);
        }
        
        if (cardId) {
          cardTransactions.get(cardId).push(new Date(transaction.created_at));
        }
      });
      
      // Calculate average time between transactions for each card
      let totalTimeDiff = 0;
      let totalTransactionPairs = 0;
      
      cardTransactions.forEach(transactions => {
        if (transactions.length > 1) {
          // Sort by time
          transactions.sort((a, b) => a.getTime() - b.getTime());
          
          for (let i = 1; i < transactions.length; i++) {
            const timeDiff = transactions[i].getTime() - transactions[i-1].getTime();
            totalTimeDiff += timeDiff;
            totalTransactionPairs++;
          }
        }
      });
      
      // Calculate average time difference in minutes
      if (totalTransactionPairs > 0) {
        averageTimeBetweenTransactions = totalTimeDiff / totalTransactionPairs / (1000 * 60); // Convert to minutes
      }
    }
    
    return {
      rushHours,
      averageTimeBetweenTransactions
    };
  } catch (error) {
    console.error('Error fetching temporal statistics:', error);
    return {
      rushHours: [],
      averageTimeBetweenTransactions: 0
    };
  }
}
