import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { getCookie, setCookie } from "@/utils/cookies";
import { useNavigate } from "react-router-dom";

const COOKIE_NAME = "chunksmith_cookie_consent";

export const CookieConsentBanner = () => {
  const [visible, setVisible] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    const consent = getCookie(COOKIE_NAME);
    if (!consent) {
      setVisible(true);
    }
  }, []);

  const handleAccept = () => {
    setCookie(COOKIE_NAME, "true", 365);
    setVisible(false);
  };

  const handleTerms = () => {
    navigate("/terms");
  };

  if (!visible) return null;

  return (
    <div className="fixed bottom-0 inset-x-0 z-40 bg-background/95 border-t shadow-lg">
      <div className="max-w-4xl mx-auto px-4 py-3 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-sm">
        <div>
          <p className="font-medium">Cookies & Terms</p>
          <p className="text-muted-foreground">
            By clicking Accept, you agree to the use of cookies for authentication
            and to our Terms & Conditions.
          </p>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={handleTerms}>
            Terms &amp; Conditions
          </Button>
          <Button size="sm" onClick={handleAccept}>
            Accept
          </Button>
        </div>
      </div>
    </div>
  );
};

