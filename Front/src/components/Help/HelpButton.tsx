import { HelpCircle } from "lucide-react";
import { Button } from "@/components/ui/button";

interface HelpButtonProps {
  onClick: () => void;
}

export const HelpButton = ({ onClick }: HelpButtonProps) => {
  return (
    <Button
      onClick={onClick}
      size="lg"
      className="fixed bottom-6 right-6 h-14 w-14 rounded-full shadow-lg hover:scale-110 transition-transform z-50"
    >
      <HelpCircle className="h-6 w-6" />
    </Button>
  );
};
