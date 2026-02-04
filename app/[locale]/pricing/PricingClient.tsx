'use client';

import { useState, useEffect, useCallback } from 'react';
import { useTranslations, useLocale } from 'next-intl';

// Type declarations for Chrome extension API
declare global {
  interface Window {
    chrome?: {
      runtime?: {
        sendMessage: (
          extensionId: string,
          message: unknown,
          callback?: (response: unknown) => void
        ) => void;
      };
    };
  }
}

type PlanType = 'free' | 'starter' | 'pro' | 'business';

interface UserData {
  email?: string;
  plan?: string;
  signed_in?: boolean;
}

interface ProfileData {
  subscription_tier?: string;
  subscription_status?: string;
}

const EXTENSION_ID = 'mommklhpammnlojjobejddmidmdcalcl';

const PLAN_CONFIG: Record<PlanType, { name: string; price: number }> = {
  free: { name: 'Free', price: 0 },
  starter: { name: 'Starter', price: 3.99 },
  pro: { name: 'Pro', price: 9.99 },
  business: { name: 'Business', price: 19.99 },
};

export function PricingClient({ plan }: { plan: PlanType }) {
  const t = useTranslations('pricing.buttons');
  const locale = useLocale();
  const [loading, setLoading] = useState(false);
  const [userData, setUserData] = useState<UserData | null>(null);
  const [profileData, setProfileData] = useState<ProfileData | null>(null);
  const [hasExtension, setHasExtension] = useState(false);

  // Check for extension and get user data
  useEffect(() => {
    const checkExtension = async () => {
      // Check URL params first
      const urlParams = new URLSearchParams(window.location.search);
      const token = urlParams.get('token');
      const source = urlParams.get('source');

      if (token) {
        try {
          const jsonString = atob(token);
          const data = JSON.parse(jsonString);
          if (data.source === 'extension' && data.timestamp && Date.now() - data.timestamp < 10 * 60 * 1000) {
            setHasExtension(true);
            if (data.signed_in && data.email) {
              setUserData({ email: data.email, plan: data.plan, signed_in: true });
              setProfileData({
                subscription_tier: data.plan,
                subscription_status: data.plan !== 'free' ? 'active' : 'free',
              });
            }
            return;
          }
        } catch (e) {
          console.error('Failed to decode token:', e);
        }
      }

      if (source === 'extension') {
        setHasExtension(true);
        const isSignedIn = urlParams.get('signed_in') === 'true';
        const userPlan = urlParams.get('plan') || 'free';
        const userEmail = urlParams.get('email') || '';
        if (isSignedIn && userEmail) {
          setUserData({ email: userEmail, plan: userPlan, signed_in: true });
          setProfileData({
            subscription_tier: userPlan,
            subscription_status: userPlan !== 'free' ? 'active' : 'free',
          });
        }
        return;
      }

      // Try to detect extension via chrome.runtime
      if (typeof window !== 'undefined' && window.chrome?.runtime) {
        try {
          window.chrome.runtime.sendMessage(EXTENSION_ID, { type: 'PING' }, (response: unknown) => {
            if (response) {
              setHasExtension(true);
              // Try to get user data
              window.chrome?.runtime?.sendMessage(
                EXTENSION_ID,
                { type: 'GET_USER_PROFILE' },
                (userResponse: unknown) => {
                  const ur = userResponse as { user?: UserData; profile?: ProfileData };
                  if (ur?.user) {
                    setUserData(ur.user);
                    setProfileData(ur.profile || null);
                  }
                }
              );
            }
          });
        } catch (e) {
          // Extension not installed
        }
      }
    };

    checkExtension();

    // Listen for window focus to refresh user data
    const handleFocus = () => {
      if (hasExtension && typeof window !== 'undefined' && window.chrome?.runtime) {
        window.chrome.runtime.sendMessage(
          EXTENSION_ID,
          { type: 'GET_USER_PROFILE' },
          (userResponse: unknown) => {
            const ur = userResponse as { user?: UserData; profile?: ProfileData };
            if (ur?.user) {
              setUserData(ur.user);
              setProfileData(ur.profile || null);
            }
          }
        );
      }
    };

    window.addEventListener('focus', handleFocus);
    return () => window.removeEventListener('focus', handleFocus);
  }, [hasExtension]);

  const getButtonState = useCallback(() => {
    const currentTier = profileData?.subscription_tier || 'free';
    const isActive = profileData?.subscription_status === 'active';

    if (!hasExtension) {
      return {
        text: t('downloadExtension'),
        className: 'cta-button download-extension',
        disabled: false,
      };
    }

    if (!userData?.signed_in) {
      return {
        text: plan === 'free' ? t('signInToStart') : t('signInToSubscribe'),
        className: 'cta-button sign-in',
        disabled: false,
      };
    }

    if (isActive && (currentTier === plan || (currentTier === 'unlimited_monthly' && plan === 'starter'))) {
      return {
        text: t('currentPlan'),
        className: 'cta-button current-plan',
        disabled: true,
      };
    }

    if (plan === 'free') {
      if (currentTier !== 'free') {
        return {
          text: t('downgrade'),
          className: 'cta-button disabled',
          disabled: false,
        };
      }
      return {
        text: t('currentPlan'),
        className: 'cta-button current-plan',
        disabled: true,
      };
    }

    const planConfig = PLAN_CONFIG[plan];
    const currentPlanConfig = PLAN_CONFIG[currentTier as PlanType] || PLAN_CONFIG.free;

    if (planConfig.price > currentPlanConfig.price) {
      return {
        text: `${t('upgrade')} ${planConfig.name}`,
        className: 'cta-button',
        disabled: false,
      };
    } else {
      return {
        text: `${t('switch')} ${planConfig.name}`,
        className: 'cta-button',
        disabled: false,
      };
    }
  }, [hasExtension, userData, profileData, plan, t]);

  const handleClick = async () => {
    if (loading) return;

    setLoading(true);

    try {
      if (!hasExtension) {
        window.open(
          'https://chromewebstore.google.com/detail/autolister-ai/mommklhpammnlojjobejddmidmdcalcl',
          '_blank'
        );
        return;
      }

      if (!userData?.signed_in) {
        console.log('Please sign in through the AutoLister AI extension first');
        return;
      }

      const currentTier = profileData?.subscription_tier || 'free';
      const isActive = profileData?.subscription_status === 'active';
      const apiBase = window.location.origin;

      if (plan === 'free') {
        if (currentTier !== 'free') {
          // Open portal to cancel subscription
          const response = await fetch(`${apiBase}/api/stripe/create-portal`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: userData.email }),
          });
          const data = await response.json();
          if (data.url) window.open(data.url, '_blank');
        }
        return;
      }

      if (isActive && (currentTier === plan || (currentTier === 'unlimited_monthly' && plan === 'starter'))) {
        // Open portal to manage subscription
        const response = await fetch(`${apiBase}/api/stripe/create-portal`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: userData.email }),
        });
        const data = await response.json();
        if (data.url) window.open(data.url, '_blank');
      } else {
        // Create checkout session
        const response = await fetch(`${apiBase}/api/stripe/create-checkout`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: userData.email, tier: plan }),
        });
        const data = await response.json();
        if (data.url) window.open(data.url, '_blank');
      }
    } catch (error) {
      console.error('Plan selection error:', error);
    } finally {
      setLoading(false);
    }
  };

  const buttonState = getButtonState();

  return (
    <button
      id={`btn-${plan}`}
      className={buttonState.className}
      onClick={handleClick}
      disabled={buttonState.disabled || loading}
    >
      <span className="btn-text">{loading ? '...' : buttonState.text}</span>
      {buttonState.disabled && <span className="btn-status">✓ {t('active')}</span>}
    </button>
  );
}
