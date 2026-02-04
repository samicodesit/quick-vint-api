import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/utils/supabaseClient';

// Required for static export
export const dynamic = 'force-static';

export async function GET(request: NextRequest) {
  // Secure the endpoint
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = request.headers.get('authorization');

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Calculate the date 30 days ago
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  // Find and update all profiles whose current period started more than 30 days ago
  const { error } = await supabase
    .from('profiles')
    .update({
      api_calls_this_month: 0,
      // Reset the period start to today for the next 30-day cycle
      last_api_call_reset: new Date().toISOString(),
    })
    .lte('last_api_call_reset', thirtyDaysAgo.toISOString()); // Use 'lte' (less than or equal)

  if (error) {
    console.error('Daily cron job failed:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }

  console.log('Daily cron job for usage reset ran successfully.');
  return NextResponse.json({
    success: true,
    message: 'Usage counts checked for reset.',
  });
}
