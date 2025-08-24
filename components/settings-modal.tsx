'use client';

import * as React from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Settings, Key, Check, AlertCircle, Info } from 'lucide-react';
import { useSettings } from '@/lib/store/api-keys';
import { cn } from '@/lib/utils';
import { Slider } from '@/components/ui/slider';

interface SettingsModalProps {
  trigger?: React.ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

export function SettingsModal({ 
  trigger, 
  open: controlledOpen, 
  onOpenChange 
}: SettingsModalProps) {
  const [internalOpen, setInternalOpen] = React.useState(false);
  const open = controlledOpen !== undefined ? controlledOpen : internalOpen;
  const setOpen = onOpenChange || setInternalOpen;

  const { openRouterKey, setOpenRouterKey, maxSteps, setMaxSteps } = useSettings();
  const [localKey, setLocalKey] = React.useState('');
  const [showKey, setShowKey] = React.useState(false);
  const [saved, setSaved] = React.useState(false);

  // Load the current key when modal opens
  React.useEffect(() => {
    if (open && openRouterKey) {
      setLocalKey(openRouterKey);
    }
  }, [open, openRouterKey]);

  const handleMaxStepsChange = (value: number[]) => {
    setMaxSteps(value[0]);
  };
 
  // Load the current key when modal opens
  React.useEffect(() => {
    if (open && openRouterKey) {
      setLocalKey(openRouterKey);
    }
  }, [open, openRouterKey]);

  const handleSave = () => {
    setOpenRouterKey(localKey);
    setSaved(true);
    setTimeout(() => {
      setSaved(false);
      setOpen(false);
    }, 1500);
  };

  const handleClear = () => {
    setLocalKey('');
    setOpenRouterKey('');
  };

  const isValidKey = (key: string) => {
    return key.startsWith('sk-or-') && key.length > 20;
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {trigger && (
        <DialogTrigger asChild>
          {trigger}
        </DialogTrigger>
      )}
      {!trigger && (
        <DialogTrigger asChild>
          <Button variant="outline" size="icon">
            <Settings className="h-4 w-4" />
          </Button>
        </DialogTrigger>
      )}
      
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Settings className="h-5 w-5" />
            Settings
          </DialogTitle>
          <DialogDescription>
            Configure your API keys for The Alpha Oracle. Your keys are stored locally and never sent to our servers.
          </DialogDescription>
        </DialogHeader>
        
        <div className="grid gap-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="openrouter-key" className="flex items-center gap-2">
              <Key className="h-4 w-4" />
              OpenRouter API Key
            </Label>
            <div className="relative">
              <Input
                id="openrouter-key"
                type={showKey ? "text" : "password"}
                value={localKey}
                onChange={(e) => setLocalKey(e.target.value)}
                placeholder="sk-or-..."
                className={cn(
                  "pr-20",
                  localKey && !isValidKey(localKey) && "border-red-500 focus-visible:ring-red-500"
                )}
              />
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="absolute right-1 top-1 h-7 text-xs"
                onClick={() => setShowKey(!showKey)}
              >
                {showKey ? "Hide" : "Show"}
              </Button>
            </div>
            {localKey && !isValidKey(localKey) && (
              <p className="text-sm text-red-500 flex items-center gap-1">
                <AlertCircle className="h-3 w-3" />
                Invalid key format. Should start with &apos;sk-or-&apos;
              </p>
            )}
            {!localKey && (
              <p className="text-sm text-muted-foreground">
                Get your API key from{' '}
                <a 
                  href="https://openrouter.ai/keys" 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="text-primary underline hover:no-underline"
                >
                  OpenRouter
                </a>
              </p>
            )}
            {localKey && isValidKey(localKey) && !saved && (
              <p className="text-sm text-green-600 flex items-center gap-1">
                <Check className="h-3 w-3" />
                Valid key format
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="max-steps" className="flex items-center gap-2">
              <Info className="h-4 w-4" />
              Maximum Research Steps
            </Label>
            <div className="flex items-center gap-4">
              <Slider
                id="max-steps"
                min={3}
                max={15}
                step={1}
                value={[maxSteps]}
                onValueChange={handleMaxStepsChange}
                className="flex-grow"
              />
              <span className="w-12 text-center text-sm font-medium bg-muted rounded-md py-1">
                {maxSteps}
              </span>
            </div>
            <p className="text-sm text-muted-foreground">
              Set the maximum number of steps for the research plan.
            </p>
          </div>
        </div>

        <DialogFooter className="flex gap-2">
          <Button
            variant="outline"
            onClick={handleClear}
            disabled={!localKey}
          >
            Clear
          </Button>
          <Button
            onClick={handleSave}
            disabled={!localKey || !isValidKey(localKey)}
            className={cn(
              saved && "bg-green-600 hover:bg-green-600"
            )}
          >
            {saved ? (
              <>
                <Check className="h-4 w-4 mr-2" />
                Saved
              </>
            ) : (
              'Save'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}