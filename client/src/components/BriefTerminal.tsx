import { useEffect, useState, useRef } from "react";
import { Terminal, Copy } from "lucide-react";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

interface BriefTerminalProps {
  content: string;
  generatedAt: string;
  className?: string;
}

export function BriefTerminal({ content, generatedAt, className }: BriefTerminalProps) {
  const [displayText, setDisplayText] = useState("");
  const [isTyping, setIsTyping] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();

  useEffect(() => {
    setDisplayText("");
    setIsTyping(true);
    let currentIndex = 0;
    const speed = 5;

    const intervalId = setInterval(() => {
      if (currentIndex < content.length) {
        setDisplayText((prev) => prev + content[currentIndex]);
        currentIndex++;
        if (scrollRef.current) {
          scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
      } else {
        setIsTyping(false);
        clearInterval(intervalId);
      }
    }, speed);

    return () => clearInterval(intervalId);
  }, [content]);

  const handleCopy = () => {
    navigator.clipboard.writeText(content);
    toast({
      title: "Copied to clipboard",
      description: "Brief content is ready to paste.",
    });
  };

  return (
    <div className={cn("relative font-mono text-sm leading-relaxed", className)}>
      <div className="absolute top-2 right-2 z-20">
        <Button 
          variant="outline" 
          size="sm" 
          className="h-8 w-8 p-0 border-primary/20"
          onClick={handleCopy}
        >
          <Copy className="h-4 w-4" />
        </Button>
      </div>
      
      <div className="flex items-center gap-2 mb-2 text-xs text-muted-foreground border-b border-primary/10 pb-2">
        <Terminal className="w-3 h-3 text-primary" />
        <span>SYS.BRIEF.LOG</span>
        <span className="ml-auto text-primary/50">
          {generatedAt ? format(new Date(generatedAt), "yyyy-MM-dd HH:mm:ss") : "NO_DATA"}
        </span>
      </div>

      <div 
        ref={scrollRef}
        className="h-[300px] overflow-y-auto pr-2 custom-scrollbar text-foreground/80 whitespace-pre-wrap"
      >
        {displayText}
        {isTyping && <span className="inline-block w-2 h-4 bg-primary ml-1 animate-pulse align-middle" />}
      </div>
    </div>
  );
}
