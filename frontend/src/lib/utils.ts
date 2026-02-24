import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatPrice(amount: number, currency = "USD"): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

export function formatDate(date: string): string {
  return new Date(date).toLocaleDateString("ko-KR", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export function getSignalColor(signal: string): string {
  switch (signal) {
    case "BUY":
      return "text-green-600 bg-green-50";
    case "WAIT":
      return "text-yellow-600 bg-yellow-50";
    case "HOLD":
      return "text-gray-500 bg-gray-50";
    default:
      return "text-gray-500 bg-gray-50";
  }
}

export function getTemperatureColor(pricePosition: number): string {
  // 0 = coolest (best price), 1 = hottest (worst price)
  if (pricePosition < 0.25) return "bg-cool-500 text-white";
  if (pricePosition < 0.5) return "bg-cool-300";
  if (pricePosition < 0.75) return "bg-farenheit-300";
  return "bg-farenheit-500 text-white";
}
