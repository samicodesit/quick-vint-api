import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/utils/supabaseClient';
import { TIER_CONFIGS } from '@/utils/tierConfig';

// Required for static export with API routes
export const dynamic = 'force-static';

export async function GET(request: NextRequest) {
  // --- AUTH with ADMIN_SECRET ---
  const adminSecret = process.env.ADMIN_SECRET;
  const authHeader = request.headers.get('authorization');

  if (!adminSecret || authHeader !== `Bearer ${adminSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const action = searchParams.get('action') || 'view-logs';

  if (action === 'view-logs') {
    return handleViewLogs(request);
  } else if (action === 'usage-stats') {
    return handleUsageStats(request);
  } else {
    return NextResponse.json({ error: 'Invalid GET action' }, { status: 400 });
  }
}

export async function POST(request: NextRequest) {
  // --- AUTH with ADMIN_SECRET ---
  const adminSecret = process.env.ADMIN_SECRET;
  const authHeader = request.headers.get('authorization');

  if (!adminSecret || authHeader !== `Bearer ${adminSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const action = searchParams.get('action');

  if (action === 'emergency-brake') {
    return handleEmergencyBrake(request);
  } else if (action === 'flag-activity') {
    return handleFlagActivity(request);
  } else if (action === 'reset-usage') {
    return handleResetUsage(request);
  } else {
    return NextResponse.json({ error: 'Invalid POST action' }, { status: 400 });
  }
}

// --- LOGIC: View Logs ---
async function handleViewLogs(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get('page') || '1');
    const limit = Math.min(parseInt(searchParams.get('limit') || '50'), 200);
    const offset = (page - 1) * limit;

    const suspiciousOnly = searchParams.get('suspicious') === 'true';
    const userId = searchParams.get('user_id');
    const startDate = searchParams.get('start_date');
    const endDate = searchParams.get('end_date');

    let query = supabase
      .from('api_logs')
      .select(
        `id, user_id, user_email, endpoint, request_method, origin, ip_address, image_urls, raw_prompt, generated_title, generated_description, response_status, openai_model, openai_tokens_used, subscription_tier, subscription_status, api_calls_count, created_at, processing_duration_ms, suspicious_activity, flagged_reason`
      )
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (suspiciousOnly) query = query.eq('suspicious_activity', true);
    if (userId) query = query.eq('user_id', userId);
    if (startDate) query = query.gte('created_at', startDate);
    if (endDate) query = query.lte('created_at', endDate);

    const { data: logs, error: logsError } = await query;

    if (logsError) {
      console.error('Error fetching logs:', logsError);
      return NextResponse.json({ error: 'Failed to fetch logs' }, { status: 500 });
    }

    let countQuery = supabase.from('api_logs').select('*', { count: 'exact', head: true });

    if (suspiciousOnly) countQuery = countQuery.eq('suspicious_activity', true);
    if (userId) countQuery = countQuery.eq('user_id', userId);
    if (startDate) countQuery = countQuery.gte('created_at', startDate);
    if (endDate) countQuery = countQuery.lte('created_at', endDate);

    const { count } = await countQuery;

    return NextResponse.json({
      logs,
      pagination: {
        page,
        limit,
        total: count || 0,
        totalPages: Math.ceil((count || 0) / limit),
      },
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// --- LOGIC: Usage Stats ---
async function handleUsageStats(request: NextRequest) {
  try {
    const now = new Date();
    const todayStr = now.toISOString().split('T')[0];

    const { data: todayStats } = await supabase
      .from('daily_stats')
      .select('*')
      .eq('date', todayStr)
      .single();

    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const weekAgoStr = weekAgo.toISOString().split('T')[0];

    const { data: logsLastWeek } = await supabase
      .from('api_logs')
      .select('created_at, openai_tokens_used')
      .gte('created_at', `${weekAgoStr}T00:00:00Z`);

    const dailyMap = new Map();
    for (let i = 0; i < 7; i++) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const dateStr = d.toISOString().split('T')[0];
      dailyMap.set(dateStr, {
        date: dateStr,
        total_api_calls: 0,
        estimated_cost: 0,
      });
    }

    if (logsLastWeek) {
      logsLastWeek.forEach((log) => {
        const dateStr = log.created_at.split('T')[0];
        if (dailyMap.has(dateStr)) {
          const entry = dailyMap.get(dateStr);
          entry.total_api_calls++;
          entry.estimated_cost += (log.openai_tokens_used || 0) * 0.0000005;
        }
      });
    }

    const weekStats = Array.from(dailyMap.values()).sort((a: any, b: any) =>
      b.date.localeCompare(a.date)
    );

    // 1. Get recent activity timestamps to sort users
    const { data: recentLogs } = await supabase
      .from('api_logs')
      .select('user_id, created_at')
      .order('created_at', { ascending: false })
      .limit(500);

    const lastActiveMap = new Map();
    if (recentLogs) {
      recentLogs.forEach((log) => {
        if (!lastActiveMap.has(log.user_id)) {
          lastActiveMap.set(log.user_id, log.created_at);
        }
      });
    }

    const { data: allUsers } = await supabase
      .from('profiles')
      .select(
        'id, email, api_calls_this_month, subscription_tier, subscription_status, created_at, current_period_end'
      )
      .order('created_at', { ascending: false })
      .limit(100);

    const { data: topUsersByUsage } = await supabase
      .from('profiles')
      .select(
        'id, email, api_calls_this_month, subscription_tier, subscription_status, created_at, current_period_end'
      )
      .order('api_calls_this_month', { ascending: false })
      .limit(50);

    // Fetch profiles for recently active users
    const recentUserIds = Array.from(lastActiveMap.keys());
    let recentUsers: any[] = [];
    if (recentUserIds.length > 0) {
      const { data } = await supabase
        .from('profiles')
        .select(
          'id, email, api_calls_this_month, subscription_tier, subscription_status, created_at, current_period_end'
        )
        .in('id', recentUserIds);
      recentUsers = data || [];
    }

    const allUserMap = new Map();
    [...(allUsers || []), ...(topUsersByUsage || []), ...recentUsers].forEach((user) => {
      if (user.email) allUserMap.set(user.email, user);
    });

    const combinedUsers = Array.from(allUserMap.values());

    const nowIso = new Date().toISOString();
    const { data: allRateLimits } = await supabase
      .from('rate_limits')
      .select('user_id, window_type, count, expires_at')
      .or(`expires_at.gt.${nowIso},expires_at.is.null`);

    const rateLimitMap = new Map();
    if (allRateLimits) {
      allRateLimits.forEach((rl) => {
        if (!rateLimitMap.has(rl.user_id)) rateLimitMap.set(rl.user_id, []);
        rateLimitMap.get(rl.user_id).push(rl);
      });
    }

    const enrichedUsers = combinedUsers.map((user: any) => {
      const limits = rateLimitMap.get(user.id) || [];
      const tierConfig =
        TIER_CONFIGS[user.subscription_tier as keyof typeof TIER_CONFIGS] || TIER_CONFIGS.free;
      return {
        ...user,
        last_active: lastActiveMap.get(user.id) || user.created_at,
        limits,
        max_limits: {
          day: tierConfig.limits.daily,
          month: tierConfig.limits.monthly,
        },
      };
    });

    // Get total user count
    const { count: totalUserCount } = await supabase
      .from('profiles')
      .select('*', { count: 'exact', head: true });

    // Sort by last_active descending for recent activity view
    const recentActivityUsers = [...enrichedUsers].sort((a: any, b: any) =>
      b.last_active.localeCompare(a.last_active)
    );

    // Sort by created_at descending for recent signups view
    const recentSignups = [...enrichedUsers].sort((a: any, b: any) =>
      b.created_at.localeCompare(a.created_at)
    );

    // Sort by api_calls_this_month descending for top users by usage
    const topUsersByUsageList = [...enrichedUsers].sort(
      (a: any, b: any) => (b.api_calls_this_month || 0) - (a.api_calls_this_month || 0)
    );

    return NextResponse.json({
      today: {
        totalRequests: todayStats?.total_api_calls || 0,
        rateLimitErrors: 0,
        avgTokensPerRequest: 0,
        estimatedCost: todayStats?.estimated_cost || 0,
      },
      lastWeek: weekStats,
      totalUsers: totalUserCount || 0,
      recentActivity: recentActivityUsers,
      recentSignups: recentSignups,
      topUsersByUsage: topUsersByUsageList,
      topUsers: recentActivityUsers,
      todaysUsage: recentActivityUsers,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// --- LOGIC: Emergency Brake ---
async function handleEmergencyBrake(request: NextRequest) {
  const body = await request.json();
  const { action: brakeAction, reason } = body;

  try {
    if (brakeAction === 'enable') {
      await supabase.from('system_settings').upsert({
        key: 'emergency_brake',
        value: 'true',
        reason: reason || 'Manual activation',
        updated_at: new Date().toISOString(),
      });
      return NextResponse.json({
        success: true,
        message: 'Emergency brake enabled',
        reason,
      });
    } else if (brakeAction === 'disable') {
      await supabase.from('system_settings').upsert({
        key: 'emergency_brake',
        value: 'false',
        reason: reason || 'Manual deactivation',
        updated_at: new Date().toISOString(),
      });
      return NextResponse.json({
        success: true,
        message: 'Emergency brake disabled',
        reason,
      });
    } else {
      return NextResponse.json(
        { error: "Invalid brake action. Use 'enable' or 'disable'" },
        { status: 400 }
      );
    }
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// --- LOGIC: Flag Activity ---
async function handleFlagActivity(request: NextRequest) {
  const body = await request.json();
  const { logId, reason } = body;
  if (!logId) return NextResponse.json({ error: 'Missing logId' }, { status: 400 });

  try {
    const { error } = await supabase
      .from('api_logs')
      .update({
        suspicious_activity: true,
        flagged_reason: reason || 'Manual admin flag',
      })
      .eq('id', logId);

    if (error) throw error;
    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// --- LOGIC: Reset Usage ---
async function handleResetUsage(request: NextRequest) {
  const body = await request.json();
  const { userId } = body;
  if (!userId) return NextResponse.json({ error: 'Missing userId' }, { status: 400 });

  try {
    // 1. Reset rate limits (daily/minute)
    const { error: rateLimitError } = await supabase
      .from('rate_limits')
      .delete()
      .eq('user_id', userId);

    if (rateLimitError) throw rateLimitError;

    // 2. Reset monthly usage in profile
    const { error: profileError } = await supabase
      .from('profiles')
      .update({ api_calls_this_month: 0 })
      .eq('id', userId);

    if (profileError) throw profileError;

    return NextResponse.json({ success: true, message: 'User usage reset' });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
