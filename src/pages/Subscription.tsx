import { useState, useCallback } from "react";
import { Check, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useNavigate } from "react-router-dom";
import { useToast } from "@/hooks/use-toast";
import { db } from "@/integrations/firebase/client";
import { collection, addDoc } from "firebase/firestore";
import { useAuth } from "@/context/AuthContext";

declare global {
  interface Window {
    Razorpay: any;
  }
}

let razorpayLoadPromise: Promise<void> | null = null;

const loadRazorpayScript = (): Promise<void> => {
  if (window.Razorpay) {
    return Promise.resolve();
  }
  if (razorpayLoadPromise) {
    return razorpayLoadPromise;
  }
  razorpayLoadPromise = new Promise((resolve, reject) => {
    const existingScript = document.querySelector<HTMLScriptElement>('script[src="https://checkout.razorpay.com/v1/checkout.js"]');
    if (existingScript) {
      if (window.Razorpay) {
        resolve();
        return;
      }
      existingScript.addEventListener('load', () => resolve());
      existingScript.addEventListener('error', () => {
        razorpayLoadPromise = null;
        reject(new Error('Failed to load payment gateway.'));
      });
      return;
    }
    const script = document.createElement('script');
    script.src = 'https://checkout.razorpay.com/v1/checkout.js';
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => {
      razorpayLoadPromise = null;
      reject(new Error('Failed to load payment gateway. Please check your internet connection and try again.'));
    };
    document.body.appendChild(script);
  });
  return razorpayLoadPromise;
};

const Subscription = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { user, userProfile } = useAuth();
  const [loading, setLoading] = useState(false);

  const plans = [
    {
      name: "Free",
      price: 0,
      period: "month",
      description: "Perfect for getting started",
      features: [
        "Up to 5 properties",
        "Basic reporting",
        "Email support",
        "Mobile app access"
      ],
      popular: false,
      buttonText: "Current Plan"
    },
    {
      name: "Pro",
      price: 119,
      period: "month",
      description: "For growing property portfolios",
      features: [
        "Unlimited properties",
        "Advanced analytics",
        "Priority support",
        "Custom integrations",
        "Bulk operations",
        "API access"
      ],
      popular: true,
      buttonText: "Upgrade to Pro"
    },
    {
      name: "Enterprise",
      price: 179,
      period: "month",
      description: "For large-scale operations",
      features: [
        "Everything in Pro",
        "White-label solution",
        "Dedicated account manager",
        "Custom features",
        "SLA guarantee",
        "On-premise deployment"
      ],
      popular: false,
      buttonText: "Contact Sales"
    }
  ];

  const handlePayment = useCallback(async (plan: typeof plans[0]) => {
    if (plan.price === 0) {
      toast({
        title: "Already on Free Plan",
        description: "You're currently on the free plan.",
      });
      return;
    }

    setLoading(true);

    try {
      if (!user?.uid) {
        toast({
          title: "Authentication Required",
          description: "Please sign in before making a payment.",
          variant: "destructive"
        });
        setLoading(false);
        return;
      }

      await loadRazorpayScript();

      const options = {
        key: import.meta.env.VITE_RAZORPAY_KEY_ID,
        amount: plan.price * 100, // Amount in paise
        currency: 'INR',
        name: 'Owners Hub',
        description: `${plan.name} Plan Subscription`,
        image: '/favicon.ico',
        handler: async function (response: any) {
          try {
            // Store subscription details in Firebase Firestore
            await addDoc(collection(db, 'subscriptions'), {
              payment_id: response.razorpay_payment_id,
              plan: plan.name,
              amount: plan.price,
              currency: 'INR',
              status: 'paid',
              date: new Date().toISOString(),
              user_email: userProfile?.email || user?.email || '',
              user_id: user?.uid || '',
              features: plan.features,
              period: plan.period
            });

            toast({
              title: "Payment Successful!",
              description: `Successfully subscribed to ${plan.name} plan.`,
            });

            // Navigate back to settings
            setTimeout(() => {
              navigate('/settings');
            }, 2000);
          } catch (error) {
            console.error('Error storing subscription:', error);
            toast({
              title: "Payment Processed",
              description: "Payment successful but there was an issue storing details.",
              variant: "destructive"
            });
          }
        },
        prefill: {
          name: userProfile?.fullName || user?.displayName || '',
          email: userProfile?.email || user?.email || '',
          contact: userProfile?.phoneNumber || ''
        },
        notes: {
          plan: plan.name,
          period: plan.period
        },
        theme: {
          color: '#3b82f6'
        },
        modal: {
          ondismiss: function() {
            setLoading(false);
          }
        }
      };

      const rzp = new window.Razorpay(options);

      rzp.on('payment.failed', function (response: any) {
        console.error('Razorpay payment failed:', response.error);
        toast({
          title: "Payment Failed",
          description: response.error?.description || "Payment could not be completed. Please try again.",
          variant: "destructive"
        });
        setLoading(false);
      });

      rzp.open();
      setLoading(false);
    } catch (error: any) {
      console.error('Payment error:', error);
      toast({
        title: "Payment Error",
        description: error?.message || "Something went wrong. Please try again.",
        variant: "destructive"
      });
      setLoading(false);
    }
  }, [user, userProfile, toast, navigate]);

  return (
    <div className="min-h-screen bg-background">
      <header className="bg-background border-b border-border px-4 py-3">
        <div className="flex items-center gap-3 max-w-7xl mx-auto">
          <Button variant="ghost" size="icon" onClick={() => navigate('/settings')}>
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div>
            <h1 className="text-lg font-semibold text-foreground">Subscription Plans</h1>
            <p className="text-sm text-muted-foreground">Choose the plan that fits your needs</p>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-8">
        <div className="text-center mb-12">
          <h2 className="text-3xl font-bold text-foreground mb-4">
            Choose Your Plan
          </h2>
          <p className="text-muted-foreground text-lg">
            Unlock powerful features to manage your property portfolio
          </p>
        </div>

        <div className="grid md:grid-cols-3 gap-8">
          {plans.map((plan, index) => (
            <Card key={index} className={`relative ${plan.popular ? 'border-primary shadow-lg scale-105' : ''}`}>
              {plan.popular && (
                <Badge className="absolute -top-3 left-1/2 transform -translate-x-1/2 bg-primary text-primary-foreground">
                  Most Popular
                </Badge>
              )}
              
              <CardHeader className="text-center pb-4">
                <CardTitle className="text-2xl font-bold">{plan.name}</CardTitle>
                <CardDescription className="text-base">{plan.description}</CardDescription>
                <div className="mt-4">
                  <span className="text-4xl font-bold text-foreground">₹{plan.price}</span>
                  {plan.price > 0 && <span className="text-muted-foreground">/{plan.period}</span>}
                </div>
              </CardHeader>

              <CardContent className="space-y-6">
                <ul className="space-y-3">
                  {plan.features.map((feature, featureIndex) => (
                    <li key={featureIndex} className="flex items-center gap-2">
                      <Check className="w-4 h-4 text-success shrink-0" />
                      <span className="text-sm">{feature}</span>
                    </li>
                  ))}
                </ul>

                <Button 
                  className="w-full" 
                  variant={plan.popular ? "default" : "outline"}
                  onClick={() => handlePayment(plan)}
                  disabled={loading || plan.price === 0}
                >
                  {loading ? "Processing..." : plan.buttonText}
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>

        <div className="mt-12 text-center">
          <p className="text-muted-foreground">
            All plans include a 14-day free trial. Cancel anytime.
          </p>
        </div>
      </main>
    </div>
  );
};

export default Subscription;