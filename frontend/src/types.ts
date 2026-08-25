import { LucideIcon } from 'lucide-react';

export type Category = 
  | 'web' 
  | 'crypto' 
  | 'steg' 
  | 'rev' 
  | 'pwn' 
  | 'forensic' 
  | 'osint' 
  | 'misc';

export interface Challenge {
  id: string;
  title: string;
  category: Category;
  points: number;
  description: string;
  difficulty: 'Easy' | 'Medium' | 'Hard';
  solvedCount: number;
  author: string;
  flag: string;
  files?: { name: string; url: string }[];
  hints?: { id: string; cost: number; text: string }[];
  tags: string[];
}

export interface User {
  uid: string;
  username: string;
  points: number;
  solvedIn: string[]; // Challenge IDs
  rank: number;
}
