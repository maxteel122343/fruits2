/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Trophy, RotateCcw, Play, Sword, Settings, X, Zap, LayoutGrid } from 'lucide-react';
import { supabase } from './lib/supabase';

// --- Sound Manager (ASMR) ---
class SoundManager {
  private ctx: AudioContext | null = null;

  private init() {
    if (!this.ctx) {
      this.ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  private playTone(freq: number, type: OscillatorType, duration: number, volume: number, decay = true) {
    this.init();
    if (!this.ctx) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, this.ctx.currentTime);
    gain.gain.setValueAtTime(volume, this.ctx.currentTime);
    if (decay) {
      gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + duration);
    }
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start();
    osc.stop(this.ctx.currentTime + duration);
  }

  playFlip() {
    this.playTone(150, 'sine', 0.1, 0.1);
    this.playTone(100, 'sine', 0.15, 0.05);
  }

  playStick() {
    this.playTone(200, 'square', 0.05, 0.1);
    this.playTone(100, 'sine', 0.2, 0.2);
  }

  playBounce() {
    this.playTone(400, 'sine', 0.1, 0.1);
  }

  playCollect() {
    this.playTone(600, 'sine', 0.1, 0.2);
    setTimeout(() => this.playTone(800, 'sine', 0.1, 0.1), 50);
  }

  playUIClick() {
    this.playTone(1000, 'sine', 0.05, 0.1);
  }

  playSlice() {
    // ASMR Squish/Slice
    this.init();
    if (!this.ctx) return;
    
    const duration = 0.25;
    const bufferSize = this.ctx.sampleRate * duration;
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    
    // Noise for the "squish"
    for (let i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (bufferSize / 3));
    }
    
    const noise = this.ctx.createBufferSource();
    noise.buffer = buffer;
    
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(1200, this.ctx.currentTime);
    filter.frequency.exponentialRampToValueAtTime(300, this.ctx.currentTime + duration);
    
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.4, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + duration);
    
    noise.connect(filter);
    filter.connect(gain);
    gain.connect(this.ctx.destination);
    noise.start();

    // High-frequency "shink" for the blade
    const shink = this.ctx.createOscillator();
    shink.type = 'triangle';
    shink.frequency.setValueAtTime(3000, this.ctx.currentTime);
    shink.frequency.exponentialRampToValueAtTime(8000, this.ctx.currentTime + 0.05);
    
    const shinkGain = this.ctx.createGain();
    shinkGain.gain.setValueAtTime(0.15, this.ctx.currentTime);
    shinkGain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + 0.1);
    
    shink.connect(shinkGain);
    shinkGain.connect(this.ctx.destination);
    shink.start();
    shink.stop(this.ctx.currentTime + 0.1);
  }

  playLevelUp() {
    this.playTone(440, 'sine', 0.5, 0.1);
    setTimeout(() => this.playTone(554.37, 'sine', 0.5, 0.1), 100);
    setTimeout(() => this.playTone(659.25, 'sine', 0.5, 0.1), 200);
  }

  playThud() {
    this.playTone(80, 'square', 0.1, 0.3);
  }
}

const sounds = new SoundManager();

// --- Constants ---
const GRAVITY = 0.4;
const JUMP_FORCE = -10;
const FLIP_SPEED = 0.15;
const GROUND_Y = 500;
const KNIFE_WIDTH = 80;
const KNIFE_HEIGHT = 20;
const TERRAIN_RES = 40; // Pixels per terrain point
const BATTLE_DURATION = 180; // 3 minutes in seconds
const ARENA_WIDTH = 800; // Virtual width for the arena
const ARENA_HEIGHT = 2000; // Virtual height for vertical arena
const FREE_ARENA_WIDTH = 50000; // 10x larger (was 5000)
const FREE_ARENA_HEIGHT = 5000; // 10x larger (was 500)

interface EvolutionNode {
  id: string;
  name: string;
  icon: string;
  description: string;
  weapons: string[];
  children: string[];
}

const EVOLUTION_TREE: Record<string, EvolutionNode> = {
  root: {
    id: 'root',
    name: 'Origem',
    icon: '🔪',
    description: 'Inicie sua jornada.',
    weapons: ['chef'],
    children: ['path_heavy', 'path_precision', 'path_combat']
  },
  path_heavy: {
    id: 'path_heavy',
    name: 'Via do Impacto',
    icon: '⚒️',
    description: 'Foco em força bruta e bônus de pontos.',
    weapons: ['cleaver', 'hammer'],
    children: ['industrial_tier', 'legendary_heavy']
  },
  path_precision: {
    id: 'path_precision',
    name: 'Via da Lâmina',
    icon: '🥷', // Changed from 🎯 to Ninja
    description: 'Foco em agilidade e cortes rápidos.',
    weapons: ['boning', 'cutter'],
    children: ['tactical_tier', 'mythic_precision']
  },
  path_combat: {
    id: 'path_combat',
    name: 'Via do Duelo',
    icon: '⚔️',
    description: 'Foco em combate direto e defesa.',
    weapons: ['butterfly', 'dagger'],
    children: ['warrior_tier', 'mythic_combat']
  },
  industrial_tier: {
    id: 'industrial_tier',
    name: 'Industrial',
    icon: '⚙️',
    description: 'Máquinas de destruição.',
    weapons: ['pickaxe', 'chainsaw'],
    children: []
  },
  legendary_heavy: {
    id: 'legendary_heavy',
    name: 'Lenda Pesada',
    icon: '👑',
    description: 'O topo da força bruta.',
    weapons: ['giant', 'mjolnir'],
    children: []
  },
  tactical_tier: {
    id: 'tactical_tier',
    name: 'Tático',
    icon: '🥷',
    description: 'Eficiência militar moderna.',
    weapons: ['katana', 'plasma_katana'],
    children: []
  },
  mythic_precision: {
    id: 'mythic_precision',
    name: 'Precisão Mítica',
    icon: '🔮',
    description: 'Cortes que atravessam o espaço.',
    weapons: ['sword_light', 'muramasa'],
    children: []
  },
  warrior_tier: {
    id: 'warrior_tier',
    name: 'Guerreiro',
    icon: '🛡️',
    description: 'Treinado para a guerra.',
    weapons: ['longsword', 'rapier'],
    children: []
  },
  mythic_combat: {
    id: 'mythic_combat',
    name: 'Divino',
    icon: '✨',
    description: 'O poder dos deuses.',
    weapons: ['excalibur', 'gungnir'],
    children: []
  }
};

interface WeaponConfig {
  id: string;
  name: string;
  icon: string;
  spriteUrl?: string; // Support for custom images
  category: string;
  // Blade Dynamics
  sharpnessFactor: number; // 0.1 to 1.0
  edgeLength: number; // visual scale multiplier
  penetrationLoss: number; // % (0 to 1)
  sweetSpotBonus: number; // multiplier
  // Physical Attributes
  mass: number; // kg
  centerOfGravity: number; // 0 (hilt) to 1 (tip)
  aerodynamics: number; // drag factor (0 to 1)
  // Handle Mechanics
  hiltDurability: number; // HP
  maxEnergy?: number; // Stamina (0 to 100)
  knockbackForce?: number; // Impact factor (0 to 1)
  terrainDamage?: number; // Ground dig capability multiplier
  bounciness: number; // restitution
  stunDuration: number; // seconds
  // Movement
  swingSpeedMult: number;
  wallStickForce: number; // 0 to 1
  stickProbability: number; // 0 to 1 (ASSERTIVIDADE)
  agility?: number; // Air control (0 to 1)
  // Advantage Stats
  scoreMultiplier?: number;
  damageValue?: number; // Direct damage
  critChance?: number; // 0 to 1
  critDamage?: number; // multiplier
  damageMultiplier?: number;
  color: string;
  description: string;
}

interface Skill {
  id: string;
  name: string;
  description: string;
  icon: string;
  duration: number; // in seconds
}

const SKILLS: Skill[] = [
  { id: 'super_hot', name: 'Super Quente', description: 'Lâmina superaquecida: Dobro de pontos e hitkill.', icon: '🔥', duration: 10 },
  { id: 'spinning', name: 'Giro Infinito', description: 'Gira sem parar para múltiplos cortes.', icon: '🌀', duration: 8 },
  { id: 'perfect_stick', name: 'Cravada Perfeita', description: 'Sempre cai cravado no chão.', icon: '🎯', duration: 12 },
  { id: 'charge', name: 'Superaquecer', description: 'Segure para carregar e voar alto.', icon: '🚀', duration: 10 },
  { id: 'transversal', name: 'Corte Transversal', description: 'Cai na transversal para cortes em linha.', icon: '📐', duration: 10 },
  { id: 'slam', name: 'Cair com Tudo', description: 'Segure no ar para esmagar frutas no chão.', icon: '💥', duration: 10 },
  { id: 'wall_climb', name: 'Escalada', description: 'Gruda e escala paredes.', icon: '🧗', duration: 15 },
  { id: 'super_cut', name: 'Super Corte', description: 'Cabo e lâmina cortam tudo.', icon: '⚔️', duration: 10 },
  { id: 'total_control', name: 'Controle Total', description: 'Defina a direção exata do pulo ao estar cravado.', icon: '🎮', duration: 15 },
  { id: 'teleport_dash', name: 'Super Dash', description: 'Clique para voar instantaneamente na direção do cursor.', icon: '⚡', duration: 10 },
  { id: 'gravity_zero', name: 'Gravidade Zero', description: 'Voe livremente! A gravidade não te afeta e você pode clicar no ar.', icon: '🌌', duration: 12 },
];

const WEAPON_PRESETS: WeaponConfig[] = [
  // --- Kitchen and Household ---
  {
    id: 'chef',
    name: 'Faca de Chef',
    icon: '🔪',
    category: 'Cozinha',
    sharpnessFactor: 0.9,
    edgeLength: 1.0,
    penetrationLoss: 0.1,
    sweetSpotBonus: 1.5,
    mass: 0.3,
    centerOfGravity: 0.4,
    aerodynamics: 0.05,
    hiltDurability: 80,
    bounciness: 0.4,
    stunDuration: 0.4,
    swingSpeedMult: 1.1,
    wallStickForce: 0.7,
    agility: 0.5,
    stickProbability: 0.6,
    damageValue: 40,
    critChance: 0.1,
    critDamage: 1.5,
    maxEnergy: 100,
    knockbackForce: 0.4,
    color: '#94a3b8',
    description: 'Equilibrada e afiada. O padrão para profissionais.'
  },
  {
    id: 'cleaver',
    name: 'Facão de Açougueiro',
    icon: '🥩',
    category: 'Cozinha',
    sharpnessFactor: 0.7,
    edgeLength: 0.8,
    penetrationLoss: 0.05,
    sweetSpotBonus: 1.8,
    mass: 0.8,
    centerOfGravity: 0.7,
    aerodynamics: 0.1,
    hiltDurability: 150,
    bounciness: 0.2,
    stunDuration: 0.8,
    swingSpeedMult: 0.8,
    wallStickForce: 0.8,
    agility: 0.2,
    stickProbability: 0.8, // Heavier = More Assertive
    damageValue: 70,
    critChance: 0.05,
    critDamage: 2.0,
    maxEnergy: 70,
    knockbackForce: 0.7,
    scoreMultiplier: 1.5,
    damageMultiplier: 2.0,
    color: '#475569',
    description: 'Massa alta e enorme poder de impacto. Bônus de pontos.'
  },
  {
    id: 'bread',
    name: 'Faca de Pão',
    icon: '🥖',
    category: 'Cozinha',
    sharpnessFactor: 0.4,
    edgeLength: 1.2,
    penetrationLoss: 0.2,
    sweetSpotBonus: 1.2,
    mass: 0.2,
    centerOfGravity: 0.4,
    aerodynamics: 0.05,
    hiltDurability: 60,
    bounciness: 0.5,
    stunDuration: 0.3,
    swingSpeedMult: 1.0,
    wallStickForce: 0.5,
    agility: 0.4,
    stickProbability: 0.4,
    damageValue: 30,
    critChance: 0.05,
    critDamage: 1.2,
    color: '#cbd5e1',
    description: 'Serrilhada para atravessar cascas duras.'
  },
  {
    id: 'boning',
    name: 'Faca de Desossar',
    icon: '🍖',
    category: 'Cozinha',
    sharpnessFactor: 0.95,
    edgeLength: 0.6,
    penetrationLoss: 0.1,
    sweetSpotBonus: 1.3,
    mass: 0.15,
    centerOfGravity: 0.3,
    aerodynamics: 0.02,
    hiltDurability: 50,
    bounciness: 0.6,
    stunDuration: 0.2,
    swingSpeedMult: 1.3,
    wallStickForce: 0.9,
    agility: 0.7,
    stickProbability: 0.7,
    damageValue: 45,
    critChance: 0.25,
    critDamage: 1.8,
    color: '#94a3b8',
    description: 'Curta e extremamente pontiaguda.'
  },
  {
    id: 'fork',
    name: 'Garfo de Jantar',
    icon: '🍴',
    category: 'Cozinha',
    sharpnessFactor: 0.1,
    edgeLength: 0.3,
    penetrationLoss: 0.6,
    sweetSpotBonus: 1.0,
    mass: 0.1,
    centerOfGravity: 0.2,
    aerodynamics: 0.01,
    hiltDurability: 20,
    bounciness: 0.8,
    stunDuration: 0.2,
    swingSpeedMult: 1.5,
    wallStickForce: 0.1,
    agility: 0.9,
    stickProbability: 0.8,
    color: '#cbd5e1',
    description: 'Não corta, mas espeta com perfeição.'
  },
  {
    id: 'scissors',
    name: 'Tesoura de Cozinha',
    icon: '✂️',
    category: 'Cozinha',
    sharpnessFactor: 0.8,
    edgeLength: 0.5,
    penetrationLoss: 0.15,
    sweetSpotBonus: 1.4,
    mass: 0.25,
    centerOfGravity: 0.5,
    aerodynamics: 0.08,
    hiltDurability: 100,
    bounciness: 0.3,
    stunDuration: 0.5,
    swingSpeedMult: 1.2,
    wallStickForce: 0.4,
    agility: 0.6,
    stickProbability: 0.5,
    color: '#64748b',
    description: 'Corte duplo para precisão máxima.'
  },
  {
    id: 'pizza',
    name: 'Cortador de Pizza',
    icon: '🍕',
    category: 'Cozinha',
    sharpnessFactor: 0.6,
    edgeLength: 0.4,
    penetrationLoss: 0.05,
    sweetSpotBonus: 1.1,
    mass: 0.2,
    centerOfGravity: 0.5,
    aerodynamics: 0.1,
    hiltDurability: 70,
    bounciness: 0.4,
    stunDuration: 0.4,
    swingSpeedMult: 1.1,
    wallStickForce: 0.3,
    stickProbability: 0.3,
    damageValue: 25,
    critChance: 0.05,
    critDamage: 1.2,
    color: '#94a3b8',
    description: 'Corte contínuo em movimento circular.'
  },
  {
    id: 'peeler',
    name: 'Descascador',
    icon: '🥔',
    spriteUrl: '/peeler.png', // Using the sprite provided by the user
    category: 'Cozinha',
    sharpnessFactor: 0.5,
    edgeLength: 0.3,
    penetrationLoss: 0.01,
    sweetSpotBonus: 1.0,
    mass: 0.1,
    centerOfGravity: 0.4,
    aerodynamics: 0.05,
    hiltDurability: 40,
    bounciness: 0.7,
    stunDuration: 0.2,
    swingSpeedMult: 1.4,
    wallStickForce: 0.2,
    stickProbability: 0.3,
    damageValue: 20,
    critChance: 0.15,
    critDamage: 2.0,
    color: '#cbd5e1',
    description: 'Remove a casca sem dividir o fruto.'
  },

  // --- Tools and Workshop ---
  {
    id: 'lumberjack',
    name: 'Machado de Lenhador',
    icon: '🪓',
    category: 'Ferramentas',
    sharpnessFactor: 0.75,
    edgeLength: 0.9,
    penetrationLoss: 0.05,
    sweetSpotBonus: 1.6,
    mass: 3.5,
    centerOfGravity: 0.85,
    aerodynamics: 0.12,
    hiltDurability: 250,
    bounciness: 0.1,
    stunDuration: 1.5,
    swingSpeedMult: 0.75,
    wallStickForce: 0.95,
    stickProbability: 0.85, // Heavy = High Assertiveness
    damageValue: 85,
    critChance: 0.1,
    critDamage: 2.2,
    maxEnergy: 60,
    knockbackForce: 0.9,
    color: '#475569',
    description: 'Massa extrema na ponta para impacto devastador.'
  },
  {
    id: 'pickaxe',
    name: 'Picareta',
    icon: '⛏️',
    category: 'Ferramentas',
    sharpnessFactor: 0.85,
    edgeLength: 1.1,
    penetrationLoss: 0.02,
    sweetSpotBonus: 1.4,
    mass: 4.0,
    centerOfGravity: 0.9,
    aerodynamics: 0.15,
    hiltDurability: 300,
    bounciness: 0.05,
    stunDuration: 1.8,
    swingSpeedMult: 0.65,
    wallStickForce: 1.0,
    stickProbability: 0.95,
    damageValue: 90,
    critChance: 0.1,
    critDamage: 2.0,
    maxEnergy: 50,
    knockbackForce: 1.0,
    color: '#1e293b',
    description: 'Ponta perfurante ideal para escalada.'
  },
  {
    id: 'hammer',
    name: 'Martelo de Unha',
    icon: '🔨',
    category: 'Ferramentas',
    sharpnessFactor: 0.3,
    edgeLength: 0.4,
    penetrationLoss: 0.1,
    sweetSpotBonus: 1.2,
    mass: 1.5,
    centerOfGravity: 0.8,
    aerodynamics: 0.1,
    hiltDurability: 200,
    bounciness: 0.2,
    stunDuration: 1.0,
    swingSpeedMult: 0.85,
    wallStickForce: 0.6,
    stickProbability: 0.75, // Heavy = High Assertiveness
    damageValue: 60,
    critChance: 0.05,
    critDamage: 1.5,
    color: '#475569',
    description: 'Impacto massivo com a cabeça de metal.'
  },
  {
    id: 'handsaw',
    name: 'Serrote',
    icon: '🪚',
    category: 'Ferramentas',
    sharpnessFactor: 0.5,
    edgeLength: 1.4,
    penetrationLoss: 0.3,
    sweetSpotBonus: 1.1,
    mass: 0.6,
    centerOfGravity: 0.4,
    aerodynamics: 0.08,
    hiltDurability: 120,
    bounciness: 0.4,
    stunDuration: 0.6,
    swingSpeedMult: 0.95,
    wallStickForce: 0.4,
    stickProbability: 0.6,
    color: '#94a3b8',
    description: 'Dentes afiados para cortes progressivos.'
  },
  {
    id: 'cutter',
    name: 'Estilete',
    icon: '📦',
    category: 'Ferramentas',
    sharpnessFactor: 1.0,
    edgeLength: 0.2,
    penetrationLoss: 0.05,
    sweetSpotBonus: 1.5,
    mass: 0.05,
    centerOfGravity: 0.2,
    aerodynamics: 0.01,
    hiltDurability: 10,
    bounciness: 0.9,
    stunDuration: 0.1,
    swingSpeedMult: 1.6,
    wallStickForce: 0.8,
    agility: 1.0,
    stickProbability: 0.9,
    damageValue: 50,
    critChance: 0.4,
    critDamage: 2.5,
    maxEnergy: 150,
    knockbackForce: 0.1,
    color: '#ef4444',
    description: 'Afiação extrema, mas muito frágil.'
  },
  {
    id: 'shovel',
    name: 'Pá',
    icon: '🧹',
    category: 'Ferramentas',
    sharpnessFactor: 0.2,
    edgeLength: 1.0,
    penetrationLoss: 0.1,
    sweetSpotBonus: 1.3,
    mass: 2.5,
    centerOfGravity: 0.7,
    aerodynamics: 0.2,
    hiltDurability: 180,
    bounciness: 0.3,
    stunDuration: 1.2,
    swingSpeedMult: 0.7,
    wallStickForce: 0.3,
    agility: 0.2,
    stickProbability: 0.8, // Heavy Shovel = Assertive
    damageValue: 65,
    critChance: 0.05,
    critDamage: 1.8,
    color: '#475569',
    description: 'Área de corte larga para rebater objetos.'
  },
  {
    id: 'crowbar',
    name: 'Pé de Cabra',
    icon: '🏗️',
    category: 'Ferramentas',
    sharpnessFactor: 0.4,
    edgeLength: 0.8,
    penetrationLoss: 0.05,
    sweetSpotBonus: 1.2,
    mass: 3.0,
    centerOfGravity: 0.6,
    aerodynamics: 0.1,
    hiltDurability: 400,
    bounciness: 0.1,
    stunDuration: 1.4,
    swingSpeedMult: 0.75,
    wallStickForce: 0.5,
    agility: 0.1,
    stickProbability: 0.3,
    color: '#1e293b',
    description: 'Ferramenta de impacto indestrutível.'
  },
  {
    id: 'chainsaw',
    name: 'Motosserra',
    icon: '⚙️',
    category: 'Ferramentas',
    sharpnessFactor: 0.9,
    edgeLength: 1.2,
    penetrationLoss: 0.01,
    sweetSpotBonus: 2.5,
    mass: 6.0,
    centerOfGravity: 0.6,
    aerodynamics: 0.25,
    hiltDurability: 300,
    bounciness: 0.05,
    stunDuration: 2.0,
    swingSpeedMult: 0.5,
    wallStickForce: 0.7,
    agility: 0.05,
    stickProbability: 0.6,
    color: '#ef4444',
    description: 'Corte contínuo e devastador.'
  },

  // --- Combat and Historical ---
  {
    id: 'katana',
    name: 'Katana',
    icon: '🏮',
    category: 'Combate',
    sharpnessFactor: 1.0,
    edgeLength: 1.5,
    penetrationLoss: 0.1,
    sweetSpotBonus: 2.2,
    mass: 1.1,
    centerOfGravity: 0.4,
    aerodynamics: 0.02,
    hiltDurability: 120,
    bounciness: 0.3,
    stunDuration: 0.5,
    swingSpeedMult: 1.25,
    wallStickForce: 0.7,
    agility: 0.9,
    stickProbability: 0.8,
    damageValue: 75,
    critChance: 0.35,
    critDamage: 2.4,
    color: '#94a3b8',
    description: 'Afiação máxima para cortes precisos.'
  },
  {
    id: 'longsword',
    name: 'Espada Longa',
    icon: '⚔️',
    category: 'Combate',
    sharpnessFactor: 0.85,
    edgeLength: 1.3,
    penetrationLoss: 0.08,
    sweetSpotBonus: 1.8,
    mass: 1.5,
    centerOfGravity: 0.3,
    aerodynamics: 0.04,
    hiltDurability: 150,
    bounciness: 0.2,
    stunDuration: 0.7,
    swingSpeedMult: 1.1,
    wallStickForce: 0.6,
    agility: 0.6,
    stickProbability: 0.7,
    damageValue: 60,
    critChance: 0.15,
    critDamage: 1.8,
    color: '#64748b',
    description: 'Equilibrada e versátil para combate.'
  },
  {
    id: 'giant',
    name: 'Espada Gigante',
    icon: '🗡️',
    category: 'Combate',
    sharpnessFactor: 0.8,
    edgeLength: 2.2,
    penetrationLoss: 0.05,
    sweetSpotBonus: 2.0,
    mass: 2.5,
    centerOfGravity: 0.8,
    aerodynamics: 0.3,
    hiltDurability: 500,
    bounciness: 0.1,
    stunDuration: 1.5,
    swingSpeedMult: 0.6,
    wallStickForce: 0.5,
    agility: 0.1,
    stickProbability: 0.4,
    scoreMultiplier: 2.5,
    damageMultiplier: 3.5,
    color: '#475569',
    description: 'Arma massiva para destruição absoluta. Bônus de pontos extremos.'
  },
  {
    id: 'rapier',
    name: 'Florete',
    icon: '🤺',
    category: 'Combate',
    sharpnessFactor: 0.9,
    edgeLength: 1.4,
    penetrationLoss: 0.05,
    sweetSpotBonus: 1.2,
    mass: 0.5,
    centerOfGravity: 0.1,
    aerodynamics: 0.01,
    hiltDurability: 40,
    bounciness: 0.7,
    stunDuration: 0.3,
    swingSpeedMult: 1.5,
    wallStickForce: 0.9,
    stickProbability: 0.9,
    color: '#cbd5e1',
    description: 'Leve e rápida, focada em perfuração.'
  },
  {
    id: 'dagger',
    name: 'Adaga',
    icon: '🔪',
    category: 'Combate',
    sharpnessFactor: 0.95,
    edgeLength: 0.4,
    penetrationLoss: 0.05,
    sweetSpotBonus: 1.4,
    mass: 0.3,
    centerOfGravity: 0.2,
    aerodynamics: 0.01,
    hiltDurability: 80,
    bounciness: 0.5,
    stunDuration: 0.2,
    swingSpeedMult: 1.6,
    wallStickForce: 0.8,
    stickProbability: 0.8,
    color: '#475569',
    description: 'Alcance curto mas velocidade extrema.'
  },
  {
    id: 'scythe',
    name: 'Foice de Guerra',
    icon: '🌾',
    category: 'Combate',
    sharpnessFactor: 0.8,
    edgeLength: 1.6,
    penetrationLoss: 0.15,
    sweetSpotBonus: 2.0,
    mass: 2.0,
    centerOfGravity: 0.75,
    aerodynamics: 0.15,
    hiltDurability: 130,
    bounciness: 0.2,
    stunDuration: 0.9,
    swingSpeedMult: 0.9,
    wallStickForce: 0.6,
    stickProbability: 0.7,
    color: '#1e293b',
    description: 'Lâmina curva que puxa e corta alvos.'
  },
  {
    id: 'halberd',
    name: 'Alabarda',
    icon: '🔱',
    category: 'Combate',
    sharpnessFactor: 0.85,
    edgeLength: 2.5,
    penetrationLoss: 0.05,
    sweetSpotBonus: 1.9,
    mass: 4.5,
    centerOfGravity: 0.8,
    aerodynamics: 0.2,
    hiltDurability: 200,
    bounciness: 0.1,
    stunDuration: 1.3,
    swingSpeedMult: 0.6,
    wallStickForce: 0.8,
    stickProbability: 0.8,
    color: '#475569',
    description: 'Combina alcance de lança com peso de machado.'
  },
  {
    id: 'scimitar',
    name: 'Cimitarra',
    icon: '🌙',
    category: 'Combate',
    sharpnessFactor: 0.9,
    edgeLength: 1.2,
    penetrationLoss: 0.1,
    sweetSpotBonus: 2.1,
    mass: 1.0,
    centerOfGravity: 0.5,
    aerodynamics: 0.03,
    hiltDurability: 110,
    bounciness: 0.4,
    stunDuration: 0.4,
    swingSpeedMult: 1.3,
    wallStickForce: 0.5,
    stickProbability: 0.6,
    color: '#94a3b8',
    description: 'Lâmina curva para cortes rápidos de raspão.'
  },
  {
    id: 'shuriken',
    name: 'Shuriken',
    icon: '⭐',
    category: 'Combate',
    sharpnessFactor: 1.0,
    edgeLength: 0.3,
    penetrationLoss: 0.01,
    sweetSpotBonus: 1.5,
    mass: 0.1,
    centerOfGravity: 0.5,
    aerodynamics: 0.001,
    hiltDurability: 50,
    bounciness: 0.1,
    stunDuration: 0.1,
    swingSpeedMult: 2.0,
    wallStickForce: 1.0,
    stickProbability: 0.7,
    color: '#1e293b',
    description: 'Arremessada em linha reta com precisão.'
  },

  // --- Fantasy and Special ---
  {
    id: 'lightsaber',
    name: 'Espada de Laser',
    icon: '🔦',
    category: 'Fantasia',
    sharpnessFactor: 1.0,
    edgeLength: 1.5,
    penetrationLoss: 0.0,
    sweetSpotBonus: 3.0,
    mass: 0.5,
    centerOfGravity: 0.1,
    aerodynamics: 0.0,
    hiltDurability: 1000,
    bounciness: 0.0,
    stunDuration: 0.5,
    swingSpeedMult: 1.8,
    wallStickForce: 1.0,
    stickProbability: 1.0,
    damageValue: 99,
    critChance: 0.8,
    critDamage: 2.0,
    color: '#00ffff',
    description: 'Ignora densidade. Corte instantâneo de plasma.'
  },
  {
    id: 'doubleaxe',
    name: 'Machado Duplo',
    icon: '🪓',
    category: 'Fantasia',
    sharpnessFactor: 0.85,
    edgeLength: 1.0,
    penetrationLoss: 0.05,
    sweetSpotBonus: 2.0,
    mass: 5.0,
    centerOfGravity: 0.5,
    aerodynamics: 0.15,
    hiltDurability: 300,
    bounciness: 0.1,
    stunDuration: 1.6,
    swingSpeedMult: 0.7,
    wallStickForce: 0.9,
    stickProbability: 0.95, // Heavy Dual = High Assertiveness
    damageValue: 80,
    critChance: 0.1,
    critDamage: 2.5,
    color: '#475569',
    description: 'Lâminas em ambos os lados do giro.'
  },
  {
    id: 'iceblade',
    name: 'Lâmina de Gelo',
    icon: '❄️',
    category: 'Fantasia',
    sharpnessFactor: 0.8,
    edgeLength: 1.2,
    penetrationLoss: 0.1,
    sweetSpotBonus: 1.8,
    mass: 1.2,
    centerOfGravity: 0.4,
    aerodynamics: 0.05,
    hiltDurability: 150,
    bounciness: 0.05,
    stunDuration: 2.5,
    swingSpeedMult: 1.1,
    wallStickForce: 0.8,
    stickProbability: 0.9,
    damageValue: 60,
    critChance: 0.2,
    critDamage: 2.0,
    color: '#93c5fd',
    description: 'Congela alvos ao impactar.'
  },
  {
    id: 'fireknife',
    name: 'Faca de Fogo',
    icon: '🔥',
    category: 'Fantasia',
    sharpnessFactor: 0.9,
    edgeLength: 1.0,
    penetrationLoss: 0.05,
    sweetSpotBonus: 2.5,
    mass: 0.8,
    centerOfGravity: 0.4,
    aerodynamics: 0.05,
    hiltDurability: 200,
    bounciness: 0.2,
    stunDuration: 0.8,
    swingSpeedMult: 1.2,
    wallStickForce: 0.7,
    stickProbability: 0.7,
    damageValue: 85,
    critChance: 0.3,
    critDamage: 3.5,
    color: '#f87171',
    description: 'Cauteriza o corte com rastro de chamas.'
  },
  {
    id: 'chaos',
    name: 'Lâminas do Caos',
    icon: '⛓️',
    category: 'Fantasia',
    sharpnessFactor: 0.95,
    edgeLength: 0.8,
    penetrationLoss: 0.05,
    sweetSpotBonus: 2.2,
    mass: 2.0,
    centerOfGravity: 0.3,
    aerodynamics: 0.1,
    hiltDurability: 400,
    bounciness: 0.4,
    stunDuration: 1.0,
    swingSpeedMult: 1.4,
    wallStickForce: 0.6,
    stickProbability: 0.8,
    damageValue: 90,
    critChance: 0.15,
    critDamage: 2.2,
    color: '#ef4444',
    description: 'Lâminas brutais presas por correntes.'
  },
  {
    id: 'plasma',
    name: 'Katana de Plasma',
    icon: '⚡',
    category: 'Fantasia',
    sharpnessFactor: 1.0,
    edgeLength: 1.5,
    penetrationLoss: 0.0,
    sweetSpotBonus: 2.8,
    mass: 0.6,
    centerOfGravity: 0.3,
    aerodynamics: 0.01,
    hiltDurability: 800,
    bounciness: 0.1,
    stunDuration: 1.2,
    swingSpeedMult: 1.7,
    wallStickForce: 0.9,
    stickProbability: 0.9,
    color: '#a855f7',
    description: 'Efeito elétrico devastador no impacto.'
  },
  {
    id: 'boomerang',
    name: 'Bumerangue',
    icon: '🪃',
    category: 'Fantasia',
    sharpnessFactor: 0.7,
    edgeLength: 0.6,
    penetrationLoss: 0.1,
    sweetSpotBonus: 1.5,
    mass: 0.4,
    centerOfGravity: 0.5,
    aerodynamics: -0.1,
    hiltDurability: 100,
    bounciness: 0.6,
    stunDuration: 0.5,
    swingSpeedMult: 1.3,
    wallStickForce: 0.2,
    stickProbability: 0.4,
    color: '#fbbf24',
    description: 'Corta na ida e na volta.'
  },
  {
    id: 'claws',
    name: 'Garras de Adamantium',
    icon: '🐾',
    category: 'Fantasia',
    sharpnessFactor: 1.0,
    edgeLength: 0.4,
    penetrationLoss: 0.05,
    sweetSpotBonus: 1.8,
    mass: 0.5,
    centerOfGravity: 0.1,
    aerodynamics: 0.02,
    hiltDurability: 1000,
    bounciness: 0.2,
    stunDuration: 0.3,
    swingSpeedMult: 1.9,
    wallStickForce: 0.9,
    stickProbability: 0.9,
    color: '#64748b',
    description: 'Três lâminas indestrutíveis e rápidas.'
  },

  // --- Tactical and Modern ---
  {
    id: 'karambit',
    name: 'Karambit',
    icon: '🦅',
    category: 'Tático',
    sharpnessFactor: 0.95,
    edgeLength: 0.5,
    penetrationLoss: 0.05,
    sweetSpotBonus: 2.0,
    mass: 0.2,
    centerOfGravity: 0.2,
    aerodynamics: 0.01,
    hiltDurability: 120,
    bounciness: 0.4,
    stunDuration: 0.2,
    swingSpeedMult: 1.7,
    wallStickForce: 0.9,
    stickProbability: 0.85,
    color: '#1e293b',
    description: 'Lâmina curva em garra para cortes precisos.'
  },
  {
    id: 'balisong',
    name: 'Canivete Butterfly',
    icon: '🦋',
    category: 'Tático',
    sharpnessFactor: 0.9,
    edgeLength: 0.6,
    penetrationLoss: 0.1,
    sweetSpotBonus: 1.6,
    mass: 0.15,
    centerOfGravity: 0.4,
    aerodynamics: 0.02,
    hiltDurability: 80,
    bounciness: 0.6,
    stunDuration: 0.3,
    swingSpeedMult: 1.8,
    wallStickForce: 0.7,
    stickProbability: 0.8,
    color: '#475569',
    description: 'Acrobacias e cortes rápidos em um só.'
  },
  {
    id: 'machete',
    name: 'Facão de Mato',
    icon: '🌿',
    category: 'Tático',
    sharpnessFactor: 0.8,
    edgeLength: 1.2,
    penetrationLoss: 0.05,
    sweetSpotBonus: 1.7,
    mass: 0.7,
    centerOfGravity: 0.6,
    aerodynamics: 0.08,
    hiltDurability: 200,
    bounciness: 0.3,
    stunDuration: 0.6,
    swingSpeedMult: 1.0,
    wallStickForce: 0.8,
    stickProbability: 0.7,
    color: '#334155',
    description: 'Lâmina pesada para abrir caminho na selva.'
  },
  {
    id: 'tomahawk',
    name: 'Tomahawk Tático',
    icon: '🪓',
    category: 'Tático',
    sharpnessFactor: 0.85,
    edgeLength: 0.8,
    penetrationLoss: 0.02,
    sweetSpotBonus: 1.9,
    mass: 0.9,
    centerOfGravity: 0.8,
    aerodynamics: 0.1,
    hiltDurability: 250,
    bounciness: 0.2,
    stunDuration: 0.8,
    swingSpeedMult: 1.1,
    wallStickForce: 0.9,
    stickProbability: 0.8,
    color: '#1e293b',
    description: 'Versão moderna e leve do machado de arremesso.'
  },

  // --- Mythical and Legendary ---
  {
    id: 'excalibur',
    name: 'Excalibur',
    icon: '👑',
    category: 'Mítico',
    sharpnessFactor: 1.0,
    edgeLength: 1.4,
    penetrationLoss: 0.0,
    sweetSpotBonus: 3.5,
    mass: 1.2,
    centerOfGravity: 0.3,
    aerodynamics: 0.02,
    hiltDurability: 5000,
    bounciness: 0.1,
    stunDuration: 1.0,
    swingSpeedMult: 1.3,
    wallStickForce: 1.0,
    stickProbability: 0.95,
    damageValue: 90,
    critChance: 0.2,
    critDamage: 2.5,
    color: '#fbbf24',
    description: 'A lendária espada do Rei Arthur. Divina.'
  },
  {
    id: 'mjolnir',
    name: 'Mjölnir',
    icon: '⚡',
    category: 'Mítico',
    sharpnessFactor: 0.2,
    edgeLength: 0.6,
    penetrationLoss: 0.0,
    sweetSpotBonus: 4.0,
    mass: 50.0,
    centerOfGravity: 0.9,
    aerodynamics: 0.3,
    hiltDurability: 10000,
    bounciness: 0.0,
    stunDuration: 3.0,
    swingSpeedMult: 0.4,
    wallStickForce: 1.0,
    stickProbability: 1.0, // God Level Assertiveness
    damageValue: 100,
    critChance: 0.5,
    critDamage: 5.0,
    color: '#94a3b8',
    description: 'O martelo de Thor. Peso incomensurável.'
  },
  {
    id: 'gungnir',
    name: 'Gungnir',
    icon: '🔱',
    category: 'Mítico',
    sharpnessFactor: 1.0,
    edgeLength: 2.8,
    penetrationLoss: 0.0,
    sweetSpotBonus: 2.5,
    mass: 1.5,
    centerOfGravity: 0.8,
    aerodynamics: 0.01,
    hiltDurability: 3000,
    bounciness: 0.1,
    stunDuration: 0.5,
    swingSpeedMult: 1.4,
    wallStickForce: 1.0,
    stickProbability: 0.9,
    damageValue: 95,
    critChance: 0.15,
    critDamage: 3.0,
    color: '#fbbf24',
    description: 'A lança de Odin que nunca erra o alvo.'
  },
  {
    id: 'muramasa',
    name: 'Muramasa',
    icon: '👹',
    category: 'Mítico',
    sharpnessFactor: 1.0,
    edgeLength: 1.5,
    penetrationLoss: 0.05,
    sweetSpotBonus: 3.0,
    mass: 1.0,
    centerOfGravity: 0.4,
    aerodynamics: 0.02,
    hiltDurability: 800,
    bounciness: 0.2,
    stunDuration: 0.4,
    swingSpeedMult: 1.5,
    wallStickForce: 0.8,
    stickProbability: 0.85,
    damageValue: 80,
    critChance: 0.3,
    critDamage: 2.5,
    color: '#ef4444',
    description: 'Uma katana amaldiçoada com sede de sangue.'
  },

  // --- Office and Stationery ---
  {
    id: 'letteropener',
    name: 'Abridor de Cartas',
    icon: '✉️',
    category: 'Escritório',
    sharpnessFactor: 0.6,
    edgeLength: 0.5,
    penetrationLoss: 0.2,
    sweetSpotBonus: 1.2,
    mass: 0.1,
    centerOfGravity: 0.3,
    aerodynamics: 0.02,
    hiltDurability: 40,
    bounciness: 0.7,
    stunDuration: 0.2,
    swingSpeedMult: 1.4,
    wallStickForce: 0.4,
    stickProbability: 0.4,
    damageValue: 15,
    critChance: 0.05,
    critDamage: 1.2,
    color: '#cbd5e1',
    description: 'Elegante, mas não foi feito para combate.'
  },
  {
    id: 'ruler',
    name: 'Régua de Aço',
    icon: '📏',
    category: 'Escritório',
    sharpnessFactor: 0.4,
    edgeLength: 1.2,
    penetrationLoss: 0.3,
    sweetSpotBonus: 1.1,
    mass: 0.15,
    centerOfGravity: 0.5,
    aerodynamics: 0.05,
    hiltDurability: 100,
    bounciness: 0.5,
    stunDuration: 0.4,
    swingSpeedMult: 1.2,
    wallStickForce: 0.2,
    stickProbability: 0.2,
    color: '#94a3b8',
    description: 'Cortes retos e medidas precisas.'
  },
  {
    id: 'pencil',
    name: 'Lápis HB',
    icon: '✏️',
    category: 'Escritório',
    sharpnessFactor: 0.8,
    edgeLength: 0.4,
    penetrationLoss: 0.1,
    sweetSpotBonus: 2.0,
    mass: 0.02,
    centerOfGravity: 0.5,
    aerodynamics: 0.01,
    hiltDurability: 5,
    bounciness: 0.8,
    stunDuration: 0.1,
    swingSpeedMult: 1.9,
    wallStickForce: 0.6,
    stickProbability: 0.8,
    damageValue: 20,
    critChance: 0.6,
    critDamage: 4.0,
    color: '#eab308',
    description: 'Com um lápis... ele matou três homens.'
  },
  {
    id: 'compass',
    name: 'Compasso',
    icon: '📐',
    category: 'Escritório',
    sharpnessFactor: 0.9,
    edgeLength: 0.3,
    penetrationLoss: 0.05,
    sweetSpotBonus: 1.3,
    mass: 0.08,
    centerOfGravity: 0.4,
    aerodynamics: 0.02,
    hiltDurability: 30,
    bounciness: 0.6,
    stunDuration: 0.2,
    swingSpeedMult: 1.5,
    wallStickForce: 0.9,
    stickProbability: 0.9,
    color: '#64748b',
    description: 'Ponta de metal perfeita para círculos e furos.'
  },

  // --- Sports and Leisure ---
  {
    id: 'cricket',
    name: 'Taco de Cricket',
    icon: '🏏',
    category: 'Esportes',
    sharpnessFactor: 0.1,
    edgeLength: 1.2,
    penetrationLoss: 0.5,
    sweetSpotBonus: 2.5,
    mass: 1.4,
    centerOfGravity: 0.7,
    aerodynamics: 0.15,
    hiltDurability: 250,
    bounciness: 0.9,
    stunDuration: 1.2,
    swingSpeedMult: 0.8,
    wallStickForce: 0.1,
    stickProbability: 0.9, // Balanced for sport
    damageValue: 65,
    critChance: 0.2,
    critDamage: 2.0,
    color: '#78350f',
    description: 'Área de impacto plana para rebater tudo.'
  },
  {
    id: 'golf',
    name: 'Taco de Golfe',
    icon: '⛳',
    category: 'Esportes',
    sharpnessFactor: 0.3,
    edgeLength: 1.5,
    penetrationLoss: 0.2,
    sweetSpotBonus: 1.8,
    mass: 0.5,
    centerOfGravity: 0.9,
    aerodynamics: 0.05,
    hiltDurability: 180,
    bounciness: 0.8,
    stunDuration: 0.6,
    swingSpeedMult: 1.3,
    wallStickForce: 0.3,
    stickProbability: 0.4,
    color: '#94a3b8',
    description: 'Swing longo com peso concentrado na ponta.'
  },
  {
    id: 'skateboard',
    name: 'Skate',
    icon: '🛹',
    category: 'Esportes',
    sharpnessFactor: 0.2,
    edgeLength: 1.0,
    penetrationLoss: 0.1,
    sweetSpotBonus: 1.5,
    mass: 3.0,
    centerOfGravity: 0.5,
    aerodynamics: 0.2,
    hiltDurability: 350,
    bounciness: 0.4,
    stunDuration: 1.0,
    swingSpeedMult: 0.7,
    wallStickForce: 0.2,
    stickProbability: 0.8, // Heavy Skateboard = High Assertiveness
    damageValue: 55,
    critChance: 0.15,
    critDamage: 1.8,
    color: '#1e293b',
    description: 'Impacto de madeira e metal em alta velocidade.'
  }
];

function StatBar({ label, value, color }: { label: string; value: number; color: string }) {
  // Translate labels to requested Portuguese terms
  const translations: Record<string, string> = {
    'Sharpness': 'AFIO',
    'Blade Edge': 'FILO DO CABO',
    'Heavy Mass': 'MASSA',
    'Aero Drag': 'RESISTÊNCIA AERO',
    'Wall Stick': 'FORÇA DE GRUDE',
    'Swing Speed': 'VELOCIDADE',
    'Agility': 'AGILIDADE',
    'Assertiveness': 'ASSERTIVIDADE',
    'Damage': 'DANO',
    'Crit': 'DANO CRÍTICO',
    'HP': 'VIDA / HP',
    'Energy': 'ENERGIA',
    'Knockback': 'IMPACTO / KOCKBACK'
  };

  const displayLabel = translations[label] || label;

  return (
    <div className="space-y-1">
      <div className="flex justify-between text-[11px] font-black uppercase text-vibrant-dark tracking-tighter">
        <span>{displayLabel}</span>
        <span className="tabular-nums">{Math.round(Math.min(1, Math.max(0, value)) * 100)}%</span>
      </div>
      <div className="h-2.5 bg-vibrant-dark/10 rounded-full overflow-hidden">
        <motion.div 
          initial={{ width: 0 }}
          animate={{ width: `${Math.min(1, Math.max(0, value)) * 100}%` }}
          className={`h-full ${color}`}
        />
      </div>
    </div>
  );
}

type GameState = 'START' | 'PLAYING' | 'GAMEOVER' | 'FORGE' | 'BATTLE' | 'BATTLERESULTS' | 'FREE_ARENA';

interface BattlePlayer {
  id: string;
  name: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  angle: number;
  va: number;
  isGrounded: boolean;
  isStuck?: boolean;
  stuckSide?: 'left' | 'right';
  weapon: WeaponConfig;
  hp: number;
  maxHp: number;
  score: number;
  fruits: number;
  kills: number;
  isAI: boolean;
  respawnTimer: number;
  color: string;
  scale: number;
  level: number;
  energy: number;
  maxEnergy: number;
  displayHp?: number;
}

interface BattleFruit extends GameObject {
  vy: number;
  vx: number;
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  color: string;
  size: number;
}

interface ChoiceCard {
  id: string;
  type: 'SKILL' | 'EVOLUTION';
  data: any;
  expiresAt: number;
  groupID: string; // To remove fellow choices in the same group when one is picked
}

interface SlicedHalf {
  x: number;
  y: number;
  vx: number;
  vy: number;
  angle: number;
  va: number;
  label: string;
  color: string;
  life: number;
  scale?: number;
}

interface ImpactMark {
  x: number;
  y: number;
  life: number;
  type: 'CRACK' | 'SHADOW' | 'CRATER';
  radius?: number;
  depth?: number;
  originalY?: number;
}

interface GameObject {
  id: number;
  x: number;
  y: number;
  type: 'FRUIT' | 'SPIKE' | 'FINISH' | 'CARD' | 'PLATFORM' | 'LIFT';
  sliced: boolean;
  color: string;
  width?: number;
  height?: number;
  label?: string;
  cardType?: 'SKILL' | 'WEAPON';
  cardId?: string;
  isMoving?: boolean;
  range?: number;
  startY?: number;
  startX?: number;
  terrain?: number[];
  speed?: number;
  direction?: 'vertical' | 'horizontal';
  scale?: number;
}

const EVOLUTION_POSITIONS: Record<string, { x: number, y: number }> = {
  root: { x: 50, y: 85 },
  path_heavy: { x: 20, y: 65 },
  path_precision: { x: 50, y: 55 },
  path_combat: { x: 80, y: 65 },
  industrial_tier: { x: 10, y: 35 },
  legendary_heavy: { x: 30, y: 35 },
  tactical_tier: { x: 45, y: 25 },
  mythic_precision: { x: 55, y: 25 },
  warrior_tier: { x: 70, y: 35 },
  mythic_combat: { x: 90, y: 35 }
};

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [gameState, setGameState] = useState<GameState>('START');
  const [score, setScore] = useState(0);
  const [highScore, setHighScore] = useState(0);
  const [selectedWeapon, setSelectedWeapon] = useState<WeaponConfig>(WEAPON_PRESETS[0]);
  const [activeCategory, setActiveCategory] = useState('Cozinha');
  const [userName, setUserName] = useState('Player');
  const [hp, setHp] = useState(100);
  const [maxHp, setMaxHp] = useState(100);
  const [uiTrigger, setUiTrigger] = useState(0);
  
  // Defeat and AdMob states
  const [showDefeat, setShowDefeat] = useState(false);
  const [showAdVideo, setShowAdVideo] = useState(false);
  const [adTimer, setAdTimer] = useState(30);

  useEffect(() => {
    let interval: any;
    if (showAdVideo) {
      setAdTimer(30);
      interval = setInterval(() => {
        setAdTimer(t => Math.max(0, t - 1));
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [showAdVideo]);
  
  const [level, setLevel] = useState(1);
  const [xp, setXp] = useState(0);
  const [maxXP, setMaxXP] = useState(100);
  const [energy, setEnergy] = useState(100);
  const [maxEnergy, setMaxEnergy] = useState(100);
  
  const [evolutionPath, setEvolutionPath] = useState<'KNIFE' | 'SWORD' | 'SAW'>('KNIFE');
  const [activeChoiceCards, setActiveChoiceCards] = useState<ChoiceCard[]>([]);
  const [menuVisibility, setMenuVisibility] = useState({
    weaponForge: true,
    weaponPreview: true,
    nameInput: true,
    gameModes: true,
    leaderboard: true,
    minimap: true,
    ads: true,
    hiddenCategories: [] as string[],
    hiddenWeapons: [] as string[]
  });
  const [showAdmin, setShowAdmin] = useState(false);
  const [adminTab, setAdminTab] = useState<'UI' | 'CAT' | 'WEAPON'>('UI');
  const [itemNotif, setItemNotif] = useState<{icon: string, title: string, name: string, color: string} | null>(null);

  useEffect(() => {
    const handlePickup = (e: CustomEvent) => {
      setItemNotif(e.detail);
      setTimeout(() => setItemNotif(null), 3000);
    };
    window.addEventListener('itemPickup', handlePickup as any);
    return () => window.removeEventListener('itemPickup', handlePickup as any);
  }, []);

  useEffect(() => {
    const saved = localStorage.getItem('menuVisibility');
    if (saved) setMenuVisibility(JSON.parse(saved));
  }, []);

  const saveVisibility = (config: typeof menuVisibility) => {
    setMenuVisibility(config);
    localStorage.setItem('menuVisibility', JSON.stringify(config));
  };
  const [skillsEnabled, setSkillsEnabled] = useState(false);
  const [botsEnabled, setBotsEnabled] = useState(true);
  const [showSettings, setShowSettings] = useState(false);
  const [activeSkillsUI, setActiveSkillsUI] = useState<string[]>([]);
  const [currentPath, setCurrentPath] = useState<string>('root');
  const [showTree, setShowTree] = useState(false);
  const playerIdRef = useRef(crypto.randomUUID());
  const channelRef = useRef<any>(null);
  
  // --- Supabase Multiplayer Sync ---
  useEffect(() => {
    if (gameState !== 'BATTLE' && gameState !== 'FREE_ARENA') return;

    const channel = supabase.channel('battle-arena', {
      config: {
        presence: {
          key: playerIdRef.current,
        },
      },
    });

    channelRef.current = channel; // Store channel in a ref to use it in other functions

    channel
      .on('presence', { event: 'sync' }, () => {
        const newState = channel.presenceState();
        // Clear old remote players (keep local and AI)
        const localAndAI = gameRef.current.battlePlayers.filter(p => p.id === 'player' || p.isAI);
        const remotePlayers: BattlePlayer[] = [];
        
        Object.keys(newState).forEach(key => {
          if (key === playerIdRef.current) return;
          const presence = newState[key][0] as any;
          if (presence.playerData) {
            remotePlayers.push({ ...presence.playerData, id: key, isAI: false });
          }
        });

        gameRef.current.battlePlayers = [...localAndAI, ...remotePlayers];
      })
      .on('broadcast', { event: 'update' }, ({ payload }) => {
        const { id, data } = payload;
        if (id === playerIdRef.current) return;

        const playerIdx = gameRef.current.battlePlayers.findIndex(p => p.id === id);
        if (playerIdx !== -1) {
          const remotePlayer = gameRef.current.battlePlayers[playerIdx];
          
          // Predicted HP Logic: 
          // If we recently hit this player, don't let the network overwrite our local damage
          // unless the network value is even lower (which means they took more damage elsewhere)
          const localHP = remotePlayer.hp;
          const networkHP = data.hp;
          const finalHP = networkHP < localHP ? networkHP : localHP;

          // Update existing remote player
          gameRef.current.battlePlayers[playerIdx] = { 
            ...remotePlayer, 
            ...data,
            hp: finalHP, // Keep the lowest HP to avoid health "recovering" due to lag
            id: id,
            isAI: false 
          };
        } else {
          // Add new remote player if not in presence yet
          gameRef.current.battlePlayers.push({
            ...data,
            id: id,
            isAI: false,
            hp: data.hp || 100,
            maxHp: data.maxHp || 100,
            displayHp: data.hp || 100
          });
        }
      })
      .on('broadcast', { event: 'hit' }, ({ payload }) => {
        const { targetId, damage, attackerId } = payload;
        
        // ── Guard: I was the attacker, I already applied damage locally ──
        if (attackerId === playerIdRef.current) return;

        // Am I the intended victim? (targetId is my Supabase UUID)
        const isMe = targetId === playerIdRef.current;

        // Is this hitting a bot? (bots have ids like 'ai1', 'ai2')
        const isBotTarget = targetId.startsWith('ai');

        let target;
        if (isMe) {
          // I am the victim
          target = gameRef.current.battlePlayers.find(p => p.id === 'player');
        } else if (isBotTarget) {
          // Bot is the victim — all non-attacker clients apply it so the local
          // bot simulation stays in sync with the one who hit it
          target = gameRef.current.battlePlayers.find(p => p.id === targetId);
        }
        // Remote player victims that are NOT me: their own client handles it

        if (target) {
          target.hp -= damage;
          
          if (isMe) {
            gameRef.current.shake = 15;
            createParticles(target.x, target.y, '#FF5E5B', 15);
            sounds.playBounce();
          } else {
            createParticles(target.x, target.y, '#FF5E5B', 10);
          }

          if (target.hp <= 0 && target.respawnTimer <= 0) {
            target.respawnTimer = 3;
          }
        }
      })
      .on('broadcast', { event: 'deform_terrain' }, ({ payload }) => {
        deformTerrain(payload.x, payload.radius, payload.depth, true);
      })
      .on('broadcast', { event: 'deform_island' }, ({ payload }) => {
        const obj = gameRef.current.objects.find(o => o.id === payload.id);
        if (obj) {
          deformIsland(obj, payload.x, payload.radius, payload.depth, true);
        }
      })
      .on('broadcast', { event: 'spawn_fruit' }, ({ payload }) => {
        const existing = gameRef.current.battleFruits.find(f => f.id === payload.fruit.id);
        if (!existing) {
          gameRef.current.battleFruits.push(payload.fruit);
        }
      })
      .on('broadcast', { event: 'fruit_sliced' }, ({ payload }) => {
        const fruit = gameRef.current.battleFruits.find(f => f.id === payload.id);
        if (fruit) fruit.sliced = true;
      })
      .on('broadcast', { event: 'score_fruit' }, ({ payload }) => {
        const fruit = gameRef.current.battleFruits.find(f => f.id === payload.id);
        if (fruit) fruit.sliced = true;
      })
      .on('broadcast', { event: 'knockback' }, ({ payload }) => {
        const { targetId, vx, vy } = payload;
        // Apply knockback only if I am the target
        if (targetId === playerIdRef.current) {
          const me = gameRef.current.battlePlayers.find(p => p.id === 'player');
          if (me) {
            me.vx = vx;
            me.vy = vy;
            me.isStuck = false;
            gameRef.current.shake = 10;
            sounds.playBounce();
          }
        }
      })
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          const player = gameRef.current.battlePlayers.find(p => p.id === 'player');
          if (player) {
            await channel.track({
              online_at: new Date().toISOString(),
              playerData: {
                name: userName,
                weapon: selectedWeapon,
                color: player.color,
                level: level,
                score: score,
                hp: player.hp,
                maxHp: player.maxHp
              }
            });
          }
        }
      });

    // Broadcast local player state every 50ms (20fps sync)
    const broadcastInterval = setInterval(() => {
      const player = gameRef.current.battlePlayers.find(p => p.id === 'player');
      if (player) {
        channel.send({
          type: 'broadcast',
          event: 'update',
          payload: {
            id: playerIdRef.current,
            data: {
              x: player.x,
              y: player.y,
              vx: player.vx,
              vy: player.vy,
              angle: player.angle,
              va: player.va,
              isGrounded: player.isGrounded,
              isStuck: player.isStuck,
              stuckSide: player.stuckSide,
              hp: player.hp,
              maxHp: player.maxHp,
              level: level,
              score: player.score,
              energy: player.energy,
              name: userName,
              weapon: selectedWeapon,
              color: player.color,
              scale: player.scale
            }
          }
        });
      }
      
      // Also broadcast all local bots that belong to this client!
      const localBots = gameRef.current.battlePlayers.filter(p => p.isAI && p.id.endsWith(`-${playerIdRef.current}`));
      localBots.forEach(bot => {
        channel.send({
          type: 'broadcast',
          event: 'update',
          payload: {
            id: bot.id,
            data: {
              x: bot.x,
              y: bot.y,
              vx: bot.vx,
              vy: bot.vy,
              angle: bot.angle,
              va: bot.va,
              isGrounded: bot.isGrounded,
              isStuck: bot.isStuck,
              stuckSide: bot.stuckSide,
              hp: bot.hp,
              maxHp: bot.maxHp,
              level: bot.level,
              score: bot.score,
              energy: bot.energy,
              name: bot.name,
              weapon: bot.weapon,
              color: bot.color,
              scale: bot.scale
            }
          }
        });
      });
    }, 50);

    return () => {
      clearInterval(broadcastInterval);
      channel.unsubscribe();
    };
  }, [gameState, userName]); // Re-sync if game starts or name changes

  // Update local player object name when userName changes
  useEffect(() => {
    const p = gameRef.current.battlePlayers.find(pl => pl.id === 'player');
    if (p) p.name = userName;
  }, [userName]);

  // Choice Card logic
  useEffect(() => {
    const timer = setInterval(() => {
      const now = Date.now();
      setActiveChoiceCards(prev => prev.filter(card => card.expiresAt > now));
    }, 100);
    return () => clearInterval(timer);
  }, []);

  // Game Ref State (to avoid re-renders in game loop)
  const gameRef = useRef({
    knife: {
      x: 100,
      y: GROUND_Y - 50,
      vx: 0,
      vy: 0,
      angle: -Math.PI / 4,
      va: 0,
      isGrounded: true,
      isStuck: false,
      stuckSide: null as 'left' | 'right' | null,
      weapon: WEAPON_PRESETS[0],
      energy: 100,
      maxEnergy: 100,
      score: 0, // Ensure score is tracked internally
    },
    cameraX: 0,
    objects: [] as GameObject[],
    particles: [] as Particle[],
    slicedHalves: [] as SlicedHalf[],
    impactMarks: [] as ImpactMark[],
    damageNumbers: [] as { x: number; y: number; value: number; life: number; }[],
    mouseX: 0,
    mouseY: 0,
    shake: 0,
    lastObjectId: 0,
    battlePlayers: [] as BattlePlayer[],
    battleTimer: 0,
    battleFruits: [] as BattleFruit[],
    arenaCameraY: 0,
    activeSkills: {} as Record<string, number>,
    isCharging: false,
    chargeTime: 0,
    isSlamming: false,
    mouseDownTime: 0,
    images: {} as Record<string, HTMLImageElement>,
    terrain: [] as number[],
    leftWall: [] as number[],
    rightWall: [] as number[],
    hitCooldowns: {} as Record<string, number>, // lastHitTime per 'attackerId->targetId'
  });

  const getTerrainY = (x: number, baseline: number) => {
    const { terrain } = gameRef.current;
    if (!terrain || terrain.length === 0) return baseline;
    const index = Math.floor(x / TERRAIN_RES);
    if (index < 0) return baseline + (terrain[0] || 0);
    if (index >= terrain.length - 1) return baseline + (terrain[terrain.length - 1] || 0);
    
    // Lerp for smooth terrain
    const t = (x % TERRAIN_RES) / TERRAIN_RES;
    const h1 = terrain[index];
    const h2 = terrain[index + 1];
    return baseline + h1 + (h2 - h1) * t;
  };

  const getWallX = (y: number, baselineX: number, side: 'left' | 'right') => {
    const wall = side === 'left' ? gameRef.current.leftWall : gameRef.current.rightWall;
    if (!wall || wall.length === 0) return baselineX;
    const index = Math.floor(y / TERRAIN_RES);
    if (index < 0) return baselineX + (wall[0] || 0);
    if (index >= wall.length - 1) return baselineX + (wall[wall.length - 1] || 0);
    
    const t = (y % TERRAIN_RES) / TERRAIN_RES;
    const h1 = wall[index];
    const h2 = wall[index + 1];
    return baselineX + h1 + (h2 - h1) * t;
  };

  const deformTerrain = (x: number, radius: number, depth: number, skipNetwork = false) => {
    const { terrain } = gameRef.current;
    if (!terrain || terrain.length === 0) return;
    
    // Broadcast terrain change
    if (!skipNetwork && channelRef.current) {
        channelRef.current.send({
           type: 'broadcast',
           event: 'deform_terrain',
           payload: { x, radius, depth }
        });
    }

    const startIndex = Math.max(0, Math.floor((x - radius) / TERRAIN_RES));
    const endIndex = Math.min(terrain.length - 1, Math.floor((x + radius) / TERRAIN_RES));
    
    for (let i = startIndex; i <= endIndex; i++) {
        const px = i * TERRAIN_RES;
        const dist = Math.abs(px - x);
        if (dist < radius) {
            const force = Math.cos((dist / radius) * (Math.PI / 2));
            terrain[i] += force * depth;
        }
    }
  };

  const deformIsland = (obj: GameObject, x: number, radius: number, depth: number, skipNetwork = false) => {
    if (!obj.terrain || !obj.width) return;
    
    // Broadcast island deformation
    if (!skipNetwork && channelRef.current) {
        channelRef.current.send({
           type: 'broadcast',
           event: 'deform_island',
           payload: { id: obj.id, x, radius, depth }
        });
    }

    const startX = obj.x - obj.width / 2;
    const localX = x - startX;
    
    const startIndex = Math.max(0, Math.floor((localX - radius) / TERRAIN_RES));
    const endIndex = Math.min(obj.terrain.length - 1, Math.floor((localX + radius) / TERRAIN_RES));
    
    for (let i = startIndex; i <= endIndex; i++) {
        const px = i * TERRAIN_RES;
        const dist = Math.abs(px - localX);
        if (dist < radius) {
            const force = Math.cos((dist / radius) * (Math.PI / 2));
            obj.terrain[i] += force * depth;
        }
    }
  };

  const deformWall = (y: number, radius: number, depth: number, side: 'left' | 'right') => {
    const wall = side === 'left' ? gameRef.current.leftWall : gameRef.current.rightWall;
    if (!wall || wall.length === 0) return;
    
    const startIndex = Math.max(0, Math.floor((y - radius) / TERRAIN_RES));
    const endIndex = Math.min(wall.length - 1, Math.floor((y + radius) / TERRAIN_RES));
    
    for (let i = startIndex; i <= endIndex; i++) {
        const py = i * TERRAIN_RES;
        const dist = Math.abs(py - y);
        if (dist < radius) {
            const force = Math.cos((dist / radius) * (Math.PI / 2));
            // For left wall, dent is negative (moving further left)
            // For right wall, dent is positive (moving further right)
            wall[i] += side === 'left' ? -force * depth : force * depth;
        }
    }
  };

  const initTerrain = (width: number, height: number = 2000) => {
    const pointsX = Math.ceil(width / TERRAIN_RES) + 1;
    const terrain = new Array(pointsX).fill(0);
    for (let i = 0; i < pointsX; i++) {
        terrain[i] = (Math.random() - 0.5) * 5;
    }
    gameRef.current.terrain = terrain;

    const pointsY = Math.ceil(height / TERRAIN_RES) + 1;
    const lWall = new Array(pointsY).fill(0);
    const rWall = new Array(pointsY).fill(0);
    for (let i = 0; i < pointsY; i++) {
        lWall[i] = (Math.random() - 0.5) * 2;
        rWall[i] = (Math.random() - 0.5) * 2;
    }
    gameRef.current.leftWall = lWall;
    gameRef.current.rightWall = rWall;
  };

  const checkManualWallStick = (p: any, arenaW: number) => {
    if (p.isGrounded || p.isStuck) return;

    const wallDist = 80; 
    const angleTolerance = 0.8; 

    const leftX = getWallX(p.y, 0, 'left');
    const rightX = getWallX(p.y, arenaW, 'right');

    const distLeft = p.x - leftX;
    const distRight = rightX - p.x;

    let stuck = false;
    let normalized = p.angle % (Math.PI * 2);
    if (normalized > Math.PI) normalized -= Math.PI * 2;
    if (normalized < -Math.PI) normalized += Math.PI * 2;

    if (distLeft < wallDist) {
      const diff = Math.abs(normalized) - Math.PI;
      if (Math.abs(diff) < angleTolerance) {
        stuck = true;
        p.x = leftX + 15;
        p.isStuck = true;
        p.stuckSide = 'left';
        p.angle = Math.PI;
        deformWall(p.y, 60, 25, 'left');
      } else {
        p.vx = 8;
        p.va = (Math.random() - 0.5) * 0.8;
        p.vy = -3;
        p.x = leftX + 40;
        deformWall(p.y, 40, 10, 'left');
      }
    } else if (distRight < wallDist) {
      if (Math.abs(normalized) < angleTolerance) {
        stuck = true;
        p.x = rightX - 15;
        p.isStuck = true;
        p.stuckSide = 'right';
        p.angle = 0;
        deformWall(p.y, 60, 25, 'right');
      } else {
        p.vx = -8;
        p.va = (Math.random() - 0.5) * 0.8;
        p.vy = -3;
        p.x = rightX - 40;
        deformWall(p.y, 40, 10, 'right');
      }
    }

    if (stuck) {
      p.vx = 0;
      p.vy = 0;
      p.va = 0;
      sounds.playStick();
      createParticles(p.x, p.y, p.color || '#FFF', 20);
      gameRef.current.shake = 12;
    } else if (distLeft < wallDist || distRight < wallDist) {
      sounds.playThud();
      gameRef.current.shake = 7;
    }
  };

  const initLevel = () => {
    const objects: GameObject[] = [];
    
    // Exactly 2 suspended platforms
    const arenaW_ref = 800; // Reference width for Classic mode
    const groundY = GROUND_Y;
    
    // Medium level
    objects.push({
      id: 1001,
      x: 1000,
      y: groundY - 300,
      type: 'PLATFORM',
      sliced: false,
      color: '#475569',
      width: arenaW_ref * 0.3,
      height: 25
    });

    // High level
    objects.push({
      id: 1002,
      x: 3000,
      y: groundY - 600,
      type: 'PLATFORM',
      sliced: false,
      color: '#475569',
      width: arenaW_ref * 0.3,
      height: 25
    });

    // Initialize procedural terrain for each island
    objects.forEach(p => {
      if (p.type === 'PLATFORM') {
        const segments = Math.floor((p.width || 200) / TERRAIN_RES) + 1;
        p.terrain = Array.from({length: segments}, () => Math.random() * 15 - 5);
      }
    });

    let currentX = 400;
    // Generate other level elements (excluding random platforms)
    for (let i = 0; i < 30; i++) {
        const typeRand = Math.random();
        let type: GameObject['type'] = 'FRUIT';
        if (typeRand > 0.95) type = 'SPIKE';

      const obj: GameObject = {
        id: i,
        x: currentX,
        y: type === 'SPIKE' ? GROUND_Y - 10 : GROUND_Y - 100 - Math.random() * 150,
        type,
        sliced: false,
        color: type === 'SPIKE' ? '#FF5E5B' : ['#FFED4A', '#7AC74F', '#fb923c'][Math.floor(Math.random() * 3)],
        label: type === 'FRUIT' ? ['🍎', '🍊', '🍋', '🍉'][Math.floor(Math.random() * 4)] : undefined,
      };

      if (type === 'FRUIT') {
        obj.scale = 0.8 + Math.random() * 0.6;
        obj.speed = 1 + Math.random() * 2;
      }

      objects.push(obj);
      currentX += 300 + Math.random() * 200;
    }
    
    objects.push({
      id: 999,
      x: currentX + 500,
      y: GROUND_Y - 50,
      type: 'FINISH',
      sliced: false,
      color: '#10b981',
    });

    gameRef.current.objects = objects;
    gameRef.current.knife = {
      x: 100,
      y: GROUND_Y - 50,
      vx: 0,
      vy: 0,
      angle: -Math.PI / 4,
      va: 0,
      isGrounded: true,
      weapon: selectedWeapon,
      energy: maxEnergy,
      maxEnergy: maxEnergy,
    };
    gameRef.current.cameraX = 0;
    gameRef.current.particles = [];
    gameRef.current.slicedHalves = [];
    setScore(0);
    setEnergy(maxEnergy);
    initTerrain(15000, GROUND_Y + 500); // 15k width for level mode, plus floor depth
  };

  const initBattle = () => {
    const players: BattlePlayer[] = [
      {
        id: 'player',
        name: userName,
        x: ARENA_WIDTH / 2,
        y: ARENA_HEIGHT - 100,
        vx: 0,
        vy: 0,
        angle: -Math.PI / 4,
        va: 0,
        isGrounded: true,
        weapon: selectedWeapon,
        hp: 100,
        maxHp: 100,
        score: 0,
        fruits: 0,
        kills: 0,
        isAI: false,
        respawnTimer: 0,
        color: '#7AC74F',
        scale: 1,
        level: 1,
        energy: maxEnergy,
        maxEnergy: maxEnergy,
        displayHp: 100,
      },
      // Bots
      ...(botsEnabled ? [
        {
          id: `ai1-${playerIdRef.current}`,
          name: 'Ninja Pro',
          x: 100,
          y: ARENA_HEIGHT - 100,
          vx: 0,
          vy: 0,
          angle: -Math.PI / 4,
          va: 0,
          isGrounded: true,
          weapon: WEAPON_PRESETS[Math.floor(Math.random() * WEAPON_PRESETS.length)],
          hp: 100,
          maxHp: 100,
          displayHp: 100,
          score: 0,
          fruits: 0,
          kills: 0,
          isAI: true,
          respawnTimer: 0,
          color: '#FF5E5B',
          scale: 1,
          level: 1,
          energy: 100,
          maxEnergy: 100,
        },
        {
          id: `ai2-${playerIdRef.current}`,
          name: 'FruitSlayer',
          x: ARENA_WIDTH - 100,
          y: ARENA_HEIGHT - 100,
          vx: 0,
          vy: 0,
          angle: -Math.PI / 4,
          va: 0,
          isGrounded: true,
          weapon: WEAPON_PRESETS[Math.floor(Math.random() * WEAPON_PRESETS.length)],
          hp: 100,
          maxHp: 100,
          displayHp: 100,
          score: 0,
          fruits: 0,
          kills: 0,
          isAI: true,
          respawnTimer: 0,
          color: '#3b82f6',
          scale: 1,
          level: 1,
          energy: 100,
          maxEnergy: 100,
        },
        {
          id: `ai3-${playerIdRef.current}`,
          name: 'BladeMaster',
          x: 200,
          y: ARENA_HEIGHT - 100,
          vx: 0,
          vy: 0,
          angle: -Math.PI / 4,
          va: 0,
          isGrounded: true,
          weapon: WEAPON_PRESETS[Math.floor(Math.random() * WEAPON_PRESETS.length)],
          hp: 100,
          maxHp: 100,
          displayHp: 100,
          score: 0,
          fruits: 0,
          kills: 0,
          isAI: true,
          respawnTimer: 0,
          color: '#a855f7',
          scale: 1,
          level: 1,
          energy: 100,
          maxEnergy: 100,
        }
      ] : [])
    ];

    // Exactly 2 suspended platforms for battle
    const platforms: GameObject[] = [
      {
        id: Date.now(),
        type: 'PLATFORM',
        x: 200,
        y: ARENA_HEIGHT * 0.4,
        sliced: false,
        color: '#475569',
        width: 200,
        height: 60
      },
      {
        id: Date.now() + 1,
        type: 'PLATFORM',
        x: ARENA_WIDTH - 200,
        y: ARENA_HEIGHT * 0.6,
        sliced: false,
        color: '#475569',
        width: 200,
        height: 60
      }
    ];

    platforms.forEach(p => {
      const segments = Math.floor((p.width || 200) / TERRAIN_RES) + 1;
      p.terrain = Array.from({length: segments}, () => Math.random() * 15 - 5);
    });

    gameRef.current.objects = platforms;

    gameRef.current.battlePlayers = players;
    gameRef.current.battleTimer = BATTLE_DURATION;
    gameRef.current.battleFruits = [];
    gameRef.current.particles = [];
    gameRef.current.slicedHalves = [];
    gameRef.current.arenaCameraY = ARENA_HEIGHT - window.innerHeight + 1500;
    setScore(0);
    setEnergy(maxEnergy);
    initTerrain(ARENA_WIDTH, ARENA_HEIGHT); // 800 width for battle arena
  };

  const initFreeArena = () => {
    const players: BattlePlayer[] = [
      {
        id: 'player',
        name: userName,
        x: 200,
        y: FREE_ARENA_HEIGHT - 50,
        vx: 0,
        vy: 0,
        angle: -Math.PI / 4,
        va: 0,
        isGrounded: true,
        weapon: selectedWeapon,
        hp: 100,
        maxHp: 100,
        score: 0,
        fruits: 0,
        kills: 0,
        isAI: false,
        respawnTimer: 0,
        color: '#7AC74F',
        scale: 1,
        level: 1,
        energy: maxEnergy,
        maxEnergy: maxEnergy,
      },
      // Add more AI players for free arena
      ...(botsEnabled ? Array.from({ length: 15 }).map((_, i) => ({
        id: `ai${i}-${playerIdRef.current}`,
        name: `Bot ${i + 1}`,
        x: Math.random() * FREE_ARENA_WIDTH,
        y: FREE_ARENA_HEIGHT - 50,
        vx: 0,
        vy: 0,
        angle: -Math.PI / 4,
        va: 0,
        isGrounded: true,
        weapon: WEAPON_PRESETS[Math.floor(Math.random() * WEAPON_PRESETS.length)],
        hp: 100,
        maxHp: 100,
        score: 0,
        fruits: 0,
        kills: 0,
        isAI: true,
        respawnTimer: 0,
        color: `hsl(${Math.random() * 360}, 70%, 50%)`,
        scale: 1,
        level: 1,
        energy: 100,
        maxEnergy: 100,
        displayHp: 100,
      })) : [])
    ];

    // Exactly 2 suspended platforms for Free Arena
    const platforms: GameObject[] = [
      {
        id: Date.now(),
        type: 'PLATFORM',
        x: 400 * 0.3, // proportional 
        y: FREE_ARENA_HEIGHT * 0.4,
        sliced: false,
        color: '#475569',
        width: 800 * 0.3,
        height: 60,
      },
      {
        id: Date.now() + 1,
        type: 'PLATFORM',
        x: FREE_ARENA_WIDTH - 400 * 0.3,
        y: FREE_ARENA_HEIGHT * 0.6,
        sliced: false,
        color: '#475569',
        width: 800 * 0.3,
        height: 60,
      }
    ];
    
    // Initialize procedural terrain for each island
    platforms.forEach(p => {
      const segments = Math.floor((p.width || 200) / TERRAIN_RES) + 1;
      p.terrain = Array.from({length: segments}, () => Math.random() * 15 - 5);
    });

    gameRef.current.objects = platforms;

    gameRef.current.battlePlayers = players;
    gameRef.current.battleTimer = BATTLE_DURATION * 10;
    gameRef.current.battleFruits = [];
    gameRef.current.particles = [];
    gameRef.current.slicedHalves = [];
    gameRef.current.arenaCameraY = FREE_ARENA_HEIGHT - window.innerHeight + 1500;
    gameRef.current.cameraX = 0;
    setScore(0);
    setEnergy(maxEnergy);
    initTerrain(FREE_ARENA_WIDTH, FREE_ARENA_HEIGHT); // 50k width for free exploration
  };

  const handleMouseDown = (e: React.PointerEvent) => {
    gameRef.current.mouseDownTime = performance.now();
    
    if (gameState === 'PLAYING') {
      const { knife } = gameRef.current;
      if (!knife.isGrounded) {
        checkManualWallStick(knife, 15000); // 15k is the rLimit for classic
      }
      
      if (gameRef.current.activeSkills['charge']) {
        gameRef.current.isCharging = true;
        gameRef.current.chargeTime = 0;
      }
      if (gameRef.current.activeSkills['slam'] && !gameRef.current.knife.isGrounded) {
        gameRef.current.isSlamming = true;
      }
    } else if (gameState === 'BATTLE' || gameState === 'FREE_ARENA') {
      const player = gameRef.current.battlePlayers.find(p => p.id === 'player');
      if (player && !player.respawnTimer) {
        if (!player.isGrounded) {
          const arenaW = gameState === 'FREE_ARENA' ? FREE_ARENA_WIDTH : ARENA_WIDTH;
          checkManualWallStick(player, arenaW);
        }
        
        if (gameRef.current.activeSkills['charge']) {
          gameRef.current.isCharging = true;
          gameRef.current.chargeTime = 0;
        }
        if (gameRef.current.activeSkills['slam'] && !player.isGrounded) {
          gameRef.current.isSlamming = true;
        }
      }
    }
  };

  const handleMouseUp = (e: React.PointerEvent) => {
    const duration = performance.now() - gameRef.current.mouseDownTime;
    
    if (gameRef.current.isCharging) {
      const chargePower = Math.min(gameRef.current.chargeTime / 1000, 1.5);
      if (gameState === 'PLAYING') {
        const { knife } = gameRef.current;
        knife.vy = JUMP_FORCE * 1.5 * chargePower;
        knife.vx = 15 * chargePower;
        knife.va = FLIP_SPEED * 2;
        knife.isGrounded = false;
        sounds.playFlip();
      } else if (gameState === 'BATTLE' || gameState === 'FREE_ARENA') {
        const player = gameRef.current.battlePlayers.find(p => p.id === 'player');
        if (player) {
          player.vy = JUMP_FORCE * 1.5 * chargePower;
          player.vx = (Math.random() - 0.5) * 20 * chargePower;
          player.va = FLIP_SPEED * 2;
          player.isGrounded = false;
          sounds.playFlip();
        }
      }
      gameRef.current.isCharging = false;
      return;
    }

    const wasSlamming = gameRef.current.isSlamming;
    gameRef.current.isSlamming = false;

    // Only prevent other actions if the slap was held long enough to be an intentional descent
    if (wasSlamming && duration > 200) {
      return;
    }

    // Normal click action if not a long charge
    if (duration < 500) {
      if (gameState === 'PLAYING') {
        const { knife, activeSkills } = gameRef.current;
        
        // Power Mobility (Teleport Dash or Gravity Zero) - WORKS IN AIR
        if (activeSkills['teleport_dash'] || activeSkills['gravity_zero']) {
          const rect = canvasRef.current?.getBoundingClientRect();
          if (rect) {
            const mx = e.clientX - rect.left + gameRef.current.cameraX;
            const my = e.clientY - rect.top;
            const dx = mx - knife.x;
            const dy = my - knife.y;
            const angle = Math.atan2(dy, dx);
            const force = activeSkills['teleport_dash'] ? 25 : 12;
            knife.vx = Math.cos(angle) * force;
            knife.vy = Math.sin(angle) * force;
            knife.va = FLIP_SPEED * 3;
            knife.isGrounded = false;
            sounds.playFlip();
            return;
          }
        }

        // Total Control (Now works in air too for better mobility)
        if (activeSkills['total_control']) {
          const rect = canvasRef.current?.getBoundingClientRect();
          if (rect) {
            const mx = e.clientX - rect.left + gameRef.current.cameraX;
            const my = e.clientY - rect.top;
            const dx = mx - knife.x;
            const dy = my - knife.y;
            const angle = Math.atan2(dy, dx);
            const force = 15;
            knife.vx = Math.cos(angle) * force;
            knife.vy = Math.sin(angle) * force;
            knife.va = FLIP_SPEED * 2;
            knife.isGrounded = false;
            sounds.playFlip();
            return;
          }
        }

        // Standard Jump / Air Flip
        // Mobilidade poderosa: permitindo pulo duplo ou correção de ar
        const jumpCost = Math.max(10, 35 - (level - 1) * 1.5);
        if (!knife.isGrounded && knife.energy < jumpCost) {
          // Can't jump
          return;
        }

        if (!knife.isGrounded) {
          knife.energy -= jumpCost;
        }

        sounds.playFlip();
        const jumpForce = JUMP_FORCE * knife.weapon.swingSpeedMult;
        const flipSpeed = FLIP_SPEED * knife.weapon.swingSpeedMult;
        knife.vy = jumpForce * (knife.isGrounded ? 1 : 0.8); // Air flip is slightly weaker
        
        // Jump direction based on click position
        const rect = canvasRef.current?.getBoundingClientRect();
        if (rect) {
          const mx = e.clientX - rect.left;
          const jumpDir = mx < rect.width / 2 ? -1 : 1;
          const agilityMultiplier = knife.weapon.agility ?? 0.3;
          knife.vx = jumpDir * (5 + agilityMultiplier * 5);
          
          // SYNC SCORE HUD
          setScore(gameState === 'PLAYING' ? gameRef.current.knife.score : (gameRef.current.battlePlayers.find(p => p.id === 'player')?.score || 0));
        } else {
          knife.vx = 5;
        }

        knife.va = flipSpeed;
        knife.isGrounded = false;
        knife.isStuck = false;
      } else if (gameState === 'BATTLE' || gameState === 'FREE_ARENA') {
        const player = gameRef.current.battlePlayers.find(p => p.id === 'player');
        if (player && !player.respawnTimer) {
          const { activeSkills } = gameRef.current;

          // Power Mobility for Battle - WORKS IN AIR
          if (activeSkills['teleport_dash'] || activeSkills['gravity_zero']) {
            const rect = canvasRef.current?.getBoundingClientRect();
            if (rect) {
              const mx = e.clientX - rect.left + (gameState === 'FREE_ARENA' ? gameRef.current.cameraX : 0);
              const my = e.clientY - rect.top + (gameState === 'BATTLE' ? gameRef.current.arenaCameraY : 0);
              const dx = mx - player.x;
              const dy = my - player.y;
              const angle = Math.atan2(dy, dx);
              const force = activeSkills['teleport_dash'] ? 25 : 12;
              player.vx = Math.cos(angle) * force;
              player.vy = Math.sin(angle) * force;
              player.va = FLIP_SPEED * 3;
              player.isGrounded = false;
              sounds.playFlip();
              return;
            }
          }

          // Total Control in Battle - Now works in Air
          if (activeSkills['total_control']) {
            const rect = canvasRef.current?.getBoundingClientRect();
            if (rect) {
              const mx = e.clientX - rect.left + (gameState === 'FREE_ARENA' ? gameRef.current.cameraX : 0);
              const my = e.clientY - rect.top + (gameState === 'BATTLE' ? gameRef.current.arenaCameraY : 0);
              const dx = mx - player.x;
              const dy = my - player.y;
              const angle = Math.atan2(dy, dx);
              const force = 15;
              player.vx = Math.cos(angle) * force;
              player.vy = Math.sin(angle) * force;
              player.va = FLIP_SPEED * 2;
              player.isGrounded = false;
              sounds.playFlip();
              return;
            }
          }

          // Standard Battle Jump / Air Flip
          const jumpCost = Math.max(10, 35 - (player.level - 1) * 1.5);
          if (!player.isGrounded && player.energy < jumpCost) return;

          if (!player.isGrounded) {
             player.energy -= jumpCost;
          }

          sounds.playFlip();
          const jumpForce = JUMP_FORCE * player.weapon.swingSpeedMult;
          const flipSpeed = FLIP_SPEED * player.weapon.swingSpeedMult;
          player.vy = jumpForce * (player.isGrounded ? 1 : 0.8);
          
          // Jump direction in battle
          const rect = canvasRef.current?.getBoundingClientRect();
          if (rect) {
             const mx = e.clientX - rect.left;
             const jumpDir = mx < rect.width / 2 ? -1 : 1;
             const agilityMultiplier = player.weapon.agility ?? 0.3;
             player.vx = jumpDir * (5 + agilityMultiplier * 5);
          } else {
             player.vx = (Math.random() - 0.5) * 10;
          }
          
          player.va = flipSpeed;
          player.isGrounded = false;
          player.isStuck = false;
        }
      }
    }
  };

  const handleMouseMove = (e: React.PointerEvent) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (rect) {
      gameRef.current.mouseX = e.clientX - rect.left;
      gameRef.current.mouseY = e.clientY - rect.top;
    }
  };

  const handleAction = (e: React.MouseEvent) => {
    // Replaced by MouseDown/Up for skills
  };

  const createParticles = (x: number, y: number, color: string, count = 10) => {
    for (let i = 0; i < count; i++) {
      gameRef.current.particles.push({
        x,
        y,
        vx: (Math.random() - 0.5) * 10,
        vy: (Math.random() - 0.5) * 10,
        life: 1.0,
        color,
        size: Math.random() * 5 + 2,
      });
    }
  };

  const createSlicedHalves = (x: number, y: number, label: string, color: string, scale: number = 1) => {
    // Left half
    gameRef.current.slicedHalves.push({
      x, y,
      vx: -2 - Math.random() * 2,
      vy: -5 - Math.random() * 5,
      angle: 0,
      va: -0.1 - Math.random() * 0.1,
      label,
      color,
      life: 1.0,
      scale
    });
    // Right half
    gameRef.current.slicedHalves.push({
      x, y,
      vx: 2 + Math.random() * 2,
      vy: -5 - Math.random() * 5,
      angle: 0,
      va: 0.1 + Math.random() * 0.1,
      label,
      color,
      life: 1.0,
      scale
    });
  };

  useEffect(() => {
    if (gameState !== 'PLAYING' && gameState !== 'BATTLE' && gameState !== 'FREE_ARENA') return;

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationFrameId: number;
    let lastTime = performance.now();

    const updateBattle = (deltaTime: number) => {
      const { battlePlayers, battleFruits, particles, slicedHalves, activeSkills, objects } = gameRef.current;
      const isFreeArena = gameState === 'FREE_ARENA';
      const arenaW = isFreeArena ? FREE_ARENA_WIDTH : ARENA_WIDTH;
      const arenaH = isFreeArena ? FREE_ARENA_HEIGHT : ARENA_HEIGHT;
      
      // Update Skills
      Object.keys(activeSkills).forEach(id => {
        activeSkills[id] -= deltaTime / 1000;
        if (activeSkills[id] <= 0) delete activeSkills[id];
      });
      if (performance.now() % 500 < 20) setActiveSkillsUI(Object.keys(activeSkills));

      // Spawn Falling Cards
      if (Math.random() < 0.005) {
        const isSkill = Math.random() > 0.5;
        const cardId = isSkill 
          ? SKILLS[Math.floor(Math.random() * SKILLS.length)].id 
          : WEAPON_PRESETS[Math.floor(Math.random() * WEAPON_PRESETS.length)].id;
        
        let spawnX = Math.random() * arenaW;
        if (isFreeArena) {
          const player = battlePlayers.find(p => p.id === 'player');
          if (player) {
            spawnX = player.x + (Math.random() - 0.5) * window.innerWidth * 1.5;
            spawnX = Math.max(0, Math.min(arenaW, spawnX));
          }
        }

        objects.push({
          id: Date.now(),
          x: spawnX,
          y: gameRef.current.arenaCameraY - 100,
          type: 'CARD',
          sliced: false,
          color: isSkill ? '#fbbf24' : '#3b82f6',
          cardType: isSkill ? 'SKILL' : 'WEAPON',
          cardId: cardId,
          label: isSkill ? SKILLS.find(s => s.id === cardId)?.icon : WEAPON_PRESETS.find(w => w.id === cardId)?.icon
        });
      }

      // Update Timer
      gameRef.current.battleTimer -= deltaTime / 1000;
      if (gameRef.current.battleTimer <= 0) {
        setGameState('BATTLERESULTS');
        return;
      }

      // Update Objects (Platforms & Lifts)
      objects.forEach(obj => {
        if (obj.type === 'LIFT' && obj.speed !== undefined && obj.range !== undefined) {
          if (obj.direction === 'horizontal' && obj.startX !== undefined) {
             obj.x = obj.startX + Math.sin(performance.now() * obj.speed) * obj.range;
          } else if (obj.startY !== undefined) {
             obj.y = obj.startY + Math.sin(performance.now() * obj.speed) * obj.range;
          }
        }
      });

      // Spawn Fruits
      if (Math.random() < 0.05) {
        const isTop = Math.random() > 0.3;
        const y = isTop ? Math.random() * (arenaH * 0.3) : Math.random() * arenaH;
        
        let spawnX = Math.random() * arenaW;
        if (isFreeArena) {
          const player = battlePlayers.find(p => p.id === 'player');
          if (player) {
            spawnX = player.x + (Math.random() - 0.5) * window.innerWidth * 1.5;
            spawnX = Math.max(0, Math.min(arenaW, spawnX));
          }
        }

        const fruitScale = 0.6 + Math.random() * 1;

        const newFruit = {
          id: Date.now() + Math.random(),
          x: spawnX,
          y: gameRef.current.arenaCameraY - 100,
          vx: (Math.random() - 0.5) * (4 / fruitScale),
          vy: (2 + Math.random() * 3) * (1 / fruitScale),
          type: 'FRUIT' as any,
          sliced: false,
          color: ['#FFED4A', '#7AC74F', '#fb923c', '#ef4444', '#a855f7'][Math.floor(Math.random() * 5)],
          label: ['🍎', '🍊', '🍋', '🍉', '🍍', '🥭', '🍐', '🫐', '🍓'][Math.floor(Math.random() * 9)],
          scale: fruitScale
        };
        
        battleFruits.push(newFruit);
        
        if (channelRef.current) {
            channelRef.current.send({ type: 'broadcast', event: 'spawn_fruit', payload: { fruit: newFruit } });
        }
      }

      // Update Fruits
      gameRef.current.battleFruits = battleFruits.filter(f => {
        if (f.sliced) return false;
        
        // Add subtle horizontal wobble to fruits
        const wobble = Math.sin(Date.now() / 600 + f.id) * 0.05;
        f.vx += wobble;
        
        f.x += f.vx;
        f.y += f.vy;
        f.vy += GRAVITY; // Gravity for fruits in battle mode

        const groundY = getTerrainY(f.x, arenaH);
        if (f.y > groundY) {
            f.y = groundY;
            f.vy *= -0.5; // Bounce
            f.vx *= 0.8;
        }

        return f.y < arenaH + 100 && f.x > -100 && f.x < arenaW + 100;
      });

      // Update Falling Cards
      gameRef.current.objects = objects.filter(obj => {
        if (obj.type === 'CARD') {
          obj.y += 2;
          return obj.y < arenaH + 100;
        }
        return true;
      });

      // Update Players
      battlePlayers.forEach(p => {
        // Smooth HP Bar 'Eating' effect (all players)
        if (p.displayHp === undefined) p.displayHp = (p.hp || 0);
        // Fast lerp (0.35) — makes HP bar react quickly and visibly
        p.displayHp += ((p.hp || 0) - p.displayHp) * 0.35;
        if (Math.abs((p.hp || 0) - p.displayHp) < 0.5) p.displayHp = (p.hp || 0);

        // SKIP physics for remote players (they are managed by broadcast)
        // Local player is 'player', AI bots start with 'ai'
        const isRemote = p.id !== 'player' && !p.id.startsWith('ai');
        if (isRemote) return;

        // Custom Defeat Hook for local player
        if (p.id === 'player' && (gameRef.current as any).isDefeated) {
          p.respawnTimer = 999999; // Force prevent auto-respawns
          return;
        }

        if (p.id === 'player' && p.hp <= 0 && !(gameRef.current as any).isDefeated) {
          (gameRef.current as any).isDefeated = true;
          p.respawnTimer = 999999; // Suspend standard automatic respawn
          setShowDefeat(true);
          return;
        }

        if (p.respawnTimer > 0) {
          p.respawnTimer -= deltaTime / 1000;
          if (p.respawnTimer <= 0) {
            p.x = Math.random() * arenaW;
            p.y = arenaH - 100;
            p.hp = p.maxHp;
            p.vx = 0;
            p.vy = 0;
            p.isGrounded = true;
          }
          return;
        }

        if (p.isStuck) {
          p.vx = 0;
          p.vy = 0;
          p.va = 0;
          return;
        }

        // Energy Regeneration
        const velocity = Math.sqrt(p.vx * p.vx + p.vy * p.vy);
        const motionBonus = 1 + (velocity / 4);
        const playerLevel = p.id === 'player' ? level : p.level;
        const levelBonus = 1 + (playerLevel - 1) * 0.2;
        const baseRate = 0.5;
        const currentRecharge = baseRate * levelBonus * motionBonus;

        if (p.isGrounded) {
          p.energy = Math.min(p.maxEnergy, p.energy + currentRecharge); 
        } else {
          const airMultiplier = playerLevel >= 10 ? 0.4 : 0.2;
          p.energy = Math.min(p.maxEnergy, p.energy + currentRecharge * airMultiplier);
        }

        if (p.id === 'player') {
          setEnergy(p.energy);
          setMaxEnergy(p.maxEnergy);
          setHp(p.hp);
          setMaxHp(p.maxHp);
          setScore(Math.floor(p.score)); 

          // Forced UI Update: Synchronizes Leaderboard and Timer with game loop
          if (Math.random() < 0.2) setUiTrigger(t => t + 1); 

          // Visual motion trail for the player to show energy recharge
          if (velocity > 8 && Math.random() < 0.2) {
             particles.push({
               x: p.x,
               y: p.y,
               vx: (Math.random() - 0.5) * 2,
               vy: (Math.random() - 0.5) * 2,
               life: 0.4,
               color: '#60a5fa',
               size: 2 + Math.random() * 2
             });
          }
        }

        if (p.id === 'player') {
          p.level = level;
        }
        p.scale = 1 + (p.level - 1) * 0.2;

        // AI Logic
        if (p.isAI && p.isGrounded && Math.random() < 0.02) {
          const jumpForce = JUMP_FORCE * p.weapon.swingSpeedMult;
          p.vy = jumpForce;
          p.vx = (Math.random() - 0.5) * 15;
          p.va = FLIP_SPEED * p.weapon.swingSpeedMult;
          p.isGrounded = false;
        }

        if (!p.isGrounded) {
          p.vx *= (1 - p.weapon.aerodynamics * 0.05);
          p.va *= (1 - p.weapon.aerodynamics * 0.02);
          
          if (activeSkills['spinning']) {
            p.va = 0.5;
          }
          
          if (gameRef.current.isSlamming && p.id === 'player') {
            p.vy += 2;
            p.vx = 0;
          }

          if (!activeSkills['gravity_zero'] || p.id !== 'player') {
            p.vy += GRAVITY;
          } else {
            p.vy *= 0.95; // Dampen vertical speed in zero gravity
          }

          // Agility / Air Control Logic
          const agilityMultiplier = p.weapon.agility ?? 0.3; // Default agility if not set
          const agilityForce = (0.5 + (p.level - 1) * 0.15) * agilityMultiplier;
          const targetX = gameRef.current.mouseX + (gameState === 'FREE_ARENA' ? gameRef.current.cameraX : 0);
          
          if (p.id === 'player') {
            if (targetX < p.x - 20) p.vx -= agilityForce;
            if (targetX > p.x + 20) p.vx += agilityForce;
            
            // Balanced Oscillation (Balanço/Shake)
            // Improves air feel and prevents getting stuck on one side
            const wobble = Math.sin(Date.now() / 400) * 0.2;
            p.vx += wobble;
          }
          
          // Cap horizontal speed based on agility and level
          const maxAirVX = 8 + agilityMultiplier * 7 + (p.level - 1) * 2;
          p.vx = Math.max(-maxAirVX, Math.min(maxAirVX, p.vx));
          
          p.x += p.vx;
          p.y += p.vy;
          p.angle += p.va;

          // Platform Collision (Islands)
          objects.forEach(obj => {
            if ((obj.type === 'PLATFORM' || obj.type === 'LIFT') && obj.width && obj.height && obj.terrain) {
              const knifeTipX = p.x;
              const knifeTipY = p.y;
              
              if (knifeTipX > obj.x - obj.width/2 && knifeTipX < obj.x + obj.width/2) {
                // Find local surface Y
                const localX = knifeTipX - (obj.x - obj.width/2);
                const index = Math.floor(localX / TERRAIN_RES);
                // The base surface is at (obj.y - obj.height/2), deformed by obj.terrain
                const surfaceY = (Math.max(obj.y - obj.height/2, obj.y - obj.height/2) + ((obj.terrain[index] || 0) + (obj.terrain[index+1] || 0))/2);

                if (knifeTipY > surfaceY && knifeTipY < obj.y + obj.height/2 + 20) {
                  
                  const normalizedAngle = ((p.angle % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
                  const isTipDown = Math.abs(normalizedAngle - Math.PI / 2) < 0.5 || activeSkills['perfect_stick'];

                  if (isTipDown && Math.random() < (p.weapon.stickProbability || 0.5)) {
                    const impactVy = p.vy;
                    p.y = surfaceY + 5;
                    p.vx = 0; p.vy = 0; p.va = 0;
                    p.isGrounded = true;
                    sounds.playStick();
                    
                    const weaponScale = p.scale * (p.weapon.edgeLength || 1);
                    const impactSpeedY = Math.abs(impactVy);
                    if (impactSpeedY > 3) {
                       deformIsland(obj, p.x, 50 * weaponScale, Math.min(60, impactSpeedY * 2.0 * weaponScale));
                    }
                  } else {
                    const impactVy = p.vy;
                    p.vy *= -p.weapon.bounciness;
                    p.y = surfaceY - 5;
                    p.vx *= 0.8;
                    sounds.playBounce();
                    
                    const bounceSpeed = Math.abs(impactVy);
                    const weaponScale = p.scale * (p.weapon.edgeLength || 1);
                    if (bounceSpeed > 4) {
                       deformIsland(obj, p.x, 60 * weaponScale, Math.min(40, bounceSpeed * 1.5 * weaponScale));
                    }
                  }
                }
              }
            }
          });

          // Wall Climb Skill (only in normal arena)
          const leftW = getWallX(p.y, 0, 'left');
          const rightW = getWallX(p.y, arenaW, 'right');

          if (!isFreeArena && activeSkills['wall_climb'] && (p.x <= leftW || p.x >= rightW)) {
            p.vy = -2;
            p.vx = 0;
            p.va = 0;
            p.angle = p.x <= leftW ? -Math.PI/2 : Math.PI/2;
            if (p.id === 'player') {
                deformWall(p.y, 40, 0.5, p.x <= leftW ? 'left' : 'right');
            }
          }

          // Arena Bounds
          if (p.x < leftW) { 
            p.x = leftW; 
            p.vx *= -0.5; 
            if (p.id === 'player' && Math.abs(p.vx) > 1) {
                deformWall(p.y, 50, 2, 'left');
            }
          }
          if (p.x > rightW) { 
            p.x = rightW; 
            p.vx *= -0.5; 
            if (p.id === 'player' && Math.abs(p.vx) > 1) {
                deformWall(p.y, 50, 2, 'right');
            }
          }

          const groundY = getTerrainY(p.x, arenaH);
          if (p.y > groundY) {
            const normalizedAngle = ((p.angle % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
            const angleToGround = Math.abs(normalizedAngle - Math.PI / 2);
            const isTipDown = angleToGround < 0.3; // Near 90 degrees
            
            const stickChance = p.weapon.stickProbability || 0.5;
            const stickSuccess = (isTipDown || activeSkills['perfect_stick']) && Math.random() < stickChance;

            if (stickSuccess) {
              const impactVx = p.vx;
              const impactVy = p.vy;

              p.y = groundY + 5; // Penetrate slightly
              p.vx = 0; p.vy = 0; p.va = 0;
              p.isGrounded = true;
              sounds.playStick();
              
              const pSpeed = Math.sqrt(impactVx * impactVx + impactVy * impactVy);
              const isHeavyImpact = pSpeed > 10 || gameRef.current.isSlamming;

              const weaponScale = p.scale * (p.weapon.edgeLength || 1);
              const terrainDmg = p.weapon.terrainDamage || 1.0;
              // Deform Terrain on stick (all players + bots, proportional to speed and weapon scale)
              const impactSpeedY = Math.abs(impactVy);
              if (impactSpeedY > 3) {
                const deformDepth = Math.min(70, impactSpeedY * 2.5 * weaponScale) * terrainDmg + (gameRef.current.isSlamming && p.id === 'player' ? 30 : 0);
                deformTerrain(p.x, 50 * weaponScale * terrainDmg, deformDepth);
              }

              // Add Crater Impact Feedback
              if (isHeavyImpact) {
                gameRef.current.impactMarks.push({
                  x: p.x,
                  y: groundY,
                  life: 1.0,
                  type: 'CRATER',
                  radius: 40 + Math.random() * 40 + (gameRef.current.isSlamming ? 60 : 0),
                  depth: 20 + Math.random() * 20 + (gameRef.current.isSlamming ? 30 : 0)
                });
                createParticles(p.x, groundY, '#E6D543', 15);
              }

              // Add Impact Mark
              gameRef.current.impactMarks.push({
                x: p.x,
                y: groundY,
                life: 1.0,
                type: Math.random() > 0.5 ? 'CRACK' : 'SHADOW'
              });
              
              if (gameRef.current.isSlamming && p.id === 'player') {
                gameRef.current.shake = 30;
                // Slam logic: Damage other players (30% max HP)
                battlePlayers.forEach(other => {
                  if (other.id !== p.id && other.respawnTimer <= 0) {
                    const dist = Math.sqrt((p.x - other.x)**2 + (p.y - other.y)**2);
                    if (dist < 250 * p.scale) {
                      const damageAmt = other.maxHp * 0.3;
                      other.hp -= damageAmt;
                      
                      // BROADCAST IMPACT HIT to victims
                      if (channelRef.current && !other.id.startsWith('ai')) {
                        channelRef.current.send({
                          type: 'broadcast',
                          event: 'hit',
                          payload: {
                            targetId: other.id,
                            damage: damageAmt,
                            attackerId: playerIdRef.current
                          }
                        });
                      }

                      createParticles(other.x, other.y, '#FF5E5B', 15);
                      if (other.hp <= 0) {
                        other.respawnTimer = 3;
                        p.kills += 1;
                        p.score += 100;
                        if (isFreeArena) p.level += 1;
                      }
                    }
                  }
                });

                // Slam effect: cut nearby fruits
                gameRef.current.battleFruits.forEach(f => {
                  const dist = Math.sqrt((p.x - f.x)**2 + (p.y - f.y)**2);
                  if (dist < 250 * p.scale) {
                    if (f.sliced) return;
                    f.sliced = true;
                    sounds.playSlice();
                    p.score += 20;
                    if (p.id === 'player') setXp(px => px + 35); // XP bonus for Slam in Battle/Arena
                    createParticles(f.x, f.y, f.color);
                    createSlicedHalves(f.x, f.y, f.label || '🍎', f.color, f.scale);
                    
                    if (channelRef.current && p.id === 'player') {
                        channelRef.current.send({ type: 'broadcast', event: 'fruit_sliced', payload: { id: f.id } });
                    }
                  }
                });
                
                // Big Impact Mark
                for (let i = 0; i < 3; i++) {
                  gameRef.current.impactMarks.push({
                    x: p.x + (Math.random() - 0.5) * 60,
                    y: arenaH,
                    life: 1.5,
                    type: 'CRACK'
                  });
                }
              }
            } else {
              const impactVy = p.vy;

              p.y = groundY;
              p.vy *= -p.weapon.bounciness;
              p.vx *= 0.8;
              p.va *= -p.weapon.bounciness;
              sounds.playBounce();
              
              // Deform terrain on bounce (proportional to impact speed, weapon size and weapon angle)
              const bounceSpeed = Math.abs(impactVy);
              const weaponScale = p.scale * (p.weapon.edgeLength || 1);
              const terrainDmg = p.weapon.terrainDamage || 1.0;
              
              const isHorizontalHit = angleToGround > 1.0 && angleToGround < 2.1;
              const isTipUpHit = angleToGround > 2.5;

              if (bounceSpeed > 4) {
                 // Transversal/horizontal hits deform a wider, shallower area
                 const baseRadius = isHorizontalHit ? 140 : (isTipUpHit ? 50 : 70);
                 const baseDepth = isHorizontalHit ? 0.3 : (isTipUpHit ? 1.5 : 0.8);
                 
                 const radius = baseRadius * weaponScale * terrainDmg + bounceSpeed * 2;
                 const depth = Math.min(50, bounceSpeed * baseDepth * weaponScale) * terrainDmg;
                 
                 deformTerrain(p.x, radius, depth, p.id !== 'player');
              }
            }
          }
        }

        // Fruit & Card Collision
        gameRef.current.battleFruits.forEach(f => {
          if (f.sliced) return;
          const dx = f.x - p.x;
          const dy = f.y - p.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          const collisionRadius = 40 * p.weapon.edgeLength * p.scale;
          
          // Check if hit is with blade or handle based on orientation
          const proj = dx * Math.cos(p.angle) + dy * Math.sin(p.angle);
          const isBladeHit = proj > 0;
          
          // Super Cut Skill: handle also cuts
          const isHandleHit = activeSkills['super_cut'] && dist < 60 * p.scale && !isBladeHit;
          
          if (dist < collisionRadius || isHandleHit) {
            if (isBladeHit || activeSkills['super_cut']) {
               f.sliced = true;
               sounds.playSlice();
               p.score += Math.max(10, Math.floor(100 * p.weapon.sweetSpotBonus * (p.weapon.scoreMultiplier || 1)));
               if (p.id === 'player') {
                 setXp(px => px + 50);
                 if (channelRef.current) {
                     channelRef.current.send({ type: 'broadcast', event: 'fruit_sliced', payload: { id: f.id } });
                 }
                 sounds.playCollect();
               }
               createParticles(f.x, f.y, f.color);
               createSlicedHalves(f.x, f.y, f.label || '🍎', f.color, f.scale);
               if (p.id === 'player') gameRef.current.shake = 10;
            } else {
               // Handle hit results in physics knockback
               const angle = Math.atan2(dy, dx);
               p.vx = -Math.cos(angle) * 10;
               p.vy = -Math.sin(angle) * 10;
               sounds.playBounce();
               gameRef.current.shake = 5;
            }
          }
        });

        gameRef.current.objects.forEach(obj => {
          if (obj.type !== 'CARD' || obj.sliced) return;
          const dx = p.x - obj.x;
          const dy = p.y - obj.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < 50 * p.scale) {
            obj.sliced = true;
            if (obj.cardType === 'SKILL' && obj.cardId) {
              const skill = SKILLS.find(s => s.id === obj.cardId);
              if (skill) {
                gameRef.current.activeSkills[skill.id] = skill.duration;
                if (p.id === 'player') window.dispatchEvent(new CustomEvent('itemPickup', {detail: {icon: skill.icon, title: 'SKILL ACQUIRED', name: skill.name, color: obj.color}}));
                sounds.playLevelUp();
              }
            } else if (obj.cardType === 'WEAPON' && obj.cardId) {
              const weapon = WEAPON_PRESETS.find(w => w.id === obj.cardId);
              if (weapon) {
                p.weapon = weapon;
                if (p.id === 'player') {
                  setSelectedWeapon(weapon);
                  window.dispatchEvent(new CustomEvent('itemPickup', {detail: {icon: weapon.icon, title: 'WEAPON EQUIPPED', name: weapon.name, color: obj.color}}));
                }
                sounds.playLevelUp();
              }
            }
            createParticles(obj.x, obj.y, obj.color, 20);
          }
        });

        // Player vs Player Collision
        battlePlayers.forEach(other => {
          if (p.id === other.id || p.respawnTimer > 0 || other.respawnTimer > 0) return;
          const dx = p.x - other.x;
          const dy = p.y - other.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < 120 * Math.max(p.scale, other.scale)) {
            const pSpeed = Math.sqrt(p.vx * p.vx + p.vy * p.vy);

            // ── Blade-tip vs Handle detection ──
            // Blade tip: extends forward (~bladeLen) from player center along angle
            const pBladeLen = 60 * (p.weapon.edgeLength || 1);
            const bladeTipX = p.x + Math.cos(p.angle) * pBladeLen;
            const bladeTipY = p.y + Math.sin(p.angle) * pBladeLen;

            // Handle region of the defender: opposite end of the blade (negative angle)
            const oHandleX = other.x - Math.cos(other.angle) * 20;
            const oHandleY = other.y - Math.sin(other.angle) * 20;

            const bladeToHandle = Math.sqrt((bladeTipX - oHandleX) ** 2 + (bladeTipY - oHandleY) ** 2);
            const bladeToBody   = Math.sqrt((bladeTipX - other.x) ** 2 + (bladeTipY - other.y) ** 2);

            // Hit = blade tip near defender's handle OR blade tip near defender's body center
            const bladeHit = bladeToHandle < 45 || bladeToBody < 35;

            // Cooldown: prevent spam hits (400 ms between hits on same target)
            const cooldownKey = `${p.id}->${other.id}`;
            const now = Date.now();
            const canHit = bladeHit && (now - (gameRef.current.hitCooldowns[cooldownKey] || 0) > 400);

            if (canHit) {
              gameRef.current.hitCooldowns[cooldownKey] = now;
              const weaponScaleDamage = p.weapon.damageMultiplier || 1;
              const damageMult = (activeSkills['super_hot'] ? 5 : 1) * weaponScaleDamage;
              
              // New Damage System
              const isCrit = Math.random() < (p.weapon.critChance || 0.05);
              const critMult = isCrit ? (p.weapon.critDamage || 1.5) : 1;
              const baseDamageAmt = p.weapon.damageValue || 20;
              const finalDamage = baseDamageAmt * p.weapon.sharpnessFactor * damageMult * critMult * p.scale;
              
              other.hp -= finalDamage;
              
              // BROADCAST HIT to the victim (and everyone else to sync Bots)
              if (channelRef.current) {
                channelRef.current.send({
                  type: 'broadcast',
                  event: 'hit',
                  payload: {
                    targetId: other.id,
                    damage: finalDamage,
                    attackerId: playerIdRef.current
                  }
                });
              }

              other.isStuck = false;
              
              // Knockback System
              const pKnockback = p.weapon.knockbackForce || 0.3;
              const otherKnockback = other.weapon.knockbackForce || 0.3;
              const pushX = (p.x - other.x) / (dist || 1);
              const pushY = (p.y - other.y) / (dist || 1);
              const totalImpact = (pSpeed * p.scale * pKnockback) + (otherKnockback * 10);
              
              // Apply knockback to attacker locally (always fine)
              p.vx = pushX * totalImpact * 0.8;
              p.vy = pushY * totalImpact * 0.8;

              const otherVX = -pushX * totalImpact * 1.2;
              const otherVY = -pushY * totalImpact * 1.2;

              const isRemoteTarget = other.id !== 'player' && !other.id.startsWith('ai');
              if (isRemoteTarget) {
                // For remote players: broadcast knockback so THEIR client applies it
                if (channelRef.current) {
                  channelRef.current.send({
                    type: 'broadcast',
                    event: 'knockback',
                    payload: {
                      targetId: other.id,
                      vx: otherVX,
                      vy: otherVY,
                      attackerId: playerIdRef.current
                    }
                  });
                }
              } else {
                // For bots and local player: apply directly
                other.vx = otherVX;
                other.vy = otherVY;
              }
              
              createParticles(other.x, other.y, '#FF5E5B', 15);
              if (other.hp <= 0) {
                other.respawnTimer = 3;
                p.kills += 1;
                const killPoints = 100 * (p.weapon.scoreMultiplier || 1);
                p.score += killPoints;
                if (isFreeArena) p.level += 1;
              }
            }
          }
        });
      });

      // Camera follow player
      const player = battlePlayers.find(p => p.id === 'player');
      if (player) {
        if (isFreeArena) {
          gameRef.current.cameraX += (player.x - window.innerWidth / 2 - gameRef.current.cameraX) * 0.1;
          gameRef.current.cameraX = Math.max(0, Math.min(FREE_ARENA_WIDTH - window.innerWidth, gameRef.current.cameraX));

          const targetY = player.y - window.innerHeight / 2;
          gameRef.current.arenaCameraY += (targetY - gameRef.current.arenaCameraY) * 0.1;
          gameRef.current.arenaCameraY = Math.max(0, Math.min(FREE_ARENA_HEIGHT - window.innerHeight + 1500, gameRef.current.arenaCameraY));
        } else {
          const targetY = player.y - window.innerHeight / 2;
          gameRef.current.arenaCameraY += (targetY - gameRef.current.arenaCameraY) * 0.1;
          gameRef.current.arenaCameraY = Math.max(0, Math.min(ARENA_HEIGHT - window.innerHeight + 1500, gameRef.current.arenaCameraY));
        }
      }

      // Update particles & halves
      gameRef.current.particles = particles.filter(p => {
        p.x += p.vx; p.y += p.vy; p.vy += 0.2; p.life -= 0.02;
        return p.life > 0;
      });
      gameRef.current.slicedHalves = slicedHalves.filter(h => {
        h.x += h.vx; h.y += h.vy; h.vy += GRAVITY; h.angle += h.va; h.life -= 0.01;
        return h.life > 0 && h.y < arenaH + 200;
      });

      // Update Impact Marks
      // Update & draw floating damage numbers
      gameRef.current.damageNumbers = gameRef.current.damageNumbers.filter(dn => dn.life > 0);
      gameRef.current.damageNumbers.forEach(dn => {
        dn.y -= 1.2;
        dn.life -= 0.02;
        ctx.save();
        ctx.globalAlpha = dn.life;
        ctx.fillStyle = dn.value > 20 ? '#ff4757' : '#ffa502';
        ctx.font = `bold ${14 + Math.floor((1 - dn.life) * 6)}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.strokeStyle = '#000';
        ctx.lineWidth = 3;
        ctx.strokeText(`-${Math.ceil(dn.value)}`, dn.x, dn.y);
        ctx.fillText(`-${Math.ceil(dn.value)}`, dn.x, dn.y);
        ctx.globalAlpha = 1;
        ctx.restore();
      });

      gameRef.current.impactMarks = gameRef.current.impactMarks.filter(im => {
        im.life -= 0.005;
        return im.life > 0;
      });
    };

    const update = () => {
      const now = performance.now();
      const deltaTime = now - lastTime;
      lastTime = now;

      if (gameState === 'BATTLE' || gameState === 'FREE_ARENA') {
        updateBattle(deltaTime);
      } else {
        const { knife, objects, particles, activeSkills } = gameRef.current;
        
        // Update Skills
        Object.keys(activeSkills).forEach(id => {
          activeSkills[id] -= deltaTime / 1000;
          if (activeSkills[id] <= 0) delete activeSkills[id];
        });
        if (performance.now() % 500 < 20) setActiveSkillsUI(Object.keys(activeSkills));

        // Update Energy
        const velocity = Math.sqrt(knife.vx * knife.vx + knife.vy * knife.vy);
        const motionBonus = 1 + (velocity / 4); // Even more reward for moving fast
        const levelBonus = 1 + (level - 1) * 0.2; // 20% boost per level (was 15%)
        const baseRate = 0.5; // (was 0.4)
        const currentRecharge = baseRate * levelBonus * motionBonus;

        if (knife.isGrounded) {
          knife.energy = Math.min(knife.maxEnergy, knife.energy + currentRecharge);
        } else {
          // Air refill bonus for staying in motion
          const airMultiplier = level >= 10 ? 0.4 : 0.2;
          knife.energy = Math.min(knife.maxEnergy, knife.energy + currentRecharge * airMultiplier);
        }
        setEnergy(knife.energy);
        setMaxEnergy(knife.maxEnergy);

        // Movement Trail for Energy Recharge visual feedback
        if (velocity > 8 && Math.random() < 0.3) {
           particles.push({
             x: knife.x,
             y: knife.y,
             vx: (Math.random() - 0.5) * 2,
             vy: (Math.random() - 0.5) * 2,
             life: 0.5,
             color: '#60a5fa', // Light blue for energy
             size: 2 + Math.random() * 3
           });
        }

        // Update Platforms & Lifts
        objects.forEach(obj => {
          if (obj.type === 'LIFT' && obj.speed !== undefined && obj.range !== undefined) {
            if (obj.direction === 'horizontal' && obj.startX !== undefined) {
               obj.x = obj.startX + Math.sin(performance.now() * obj.speed) * obj.range;
            } else if (obj.startY !== undefined) {
               obj.y = obj.startY + Math.sin(performance.now() * obj.speed) * obj.range;
            }
          }
        });

        // Spawn Falling Cards in Classic Mode
        if (Math.random() < 0.003) {
          const isSkill = Math.random() > 0.5;
          const cardId = isSkill 
            ? SKILLS[Math.floor(Math.random() * SKILLS.length)].id 
            : WEAPON_PRESETS[Math.floor(Math.random() * WEAPON_PRESETS.length)].id;
          
          objects.push({
            id: Date.now(),
            x: knife.x + 400 + Math.random() * 400,
            y: -100,
            type: 'CARD',
            sliced: false,
            color: isSkill ? '#fbbf24' : '#3b82f6',
            cardType: isSkill ? 'SKILL' : 'WEAPON',
            cardId: cardId,
            label: isSkill ? SKILLS.find(s => s.id === cardId)?.icon : WEAPON_PRESETS.find(w => w.id === cardId)?.icon
          });
        }

        if (gameRef.current.isCharging) {
          gameRef.current.chargeTime += deltaTime;
        }

        if (!knife.isGrounded && !knife.isStuck) {
          knife.vx *= (1 - knife.weapon.aerodynamics * 0.05);
          knife.va *= (1 - knife.weapon.aerodynamics * 0.02);
          
          if (activeSkills['spinning']) {
            knife.va = 0.5;
          }
          
          if (gameRef.current.isSlamming) {
            knife.vy += 2;
            knife.vx = 0;
          }

          if (!activeSkills['gravity_zero']) {
            knife.vy += GRAVITY;
          } else {
            knife.vy *= 0.95; // Dampen vertical speed in zero gravity
          }

          // Agility / Air Control Logic
          const agilityMultiplier = knife.weapon.agility ?? 0.3;
          const agilityForce = (0.5 + (level - 1) * 0.15) * agilityMultiplier;
          const targetX = gameRef.current.mouseX + gameRef.current.cameraX;
          if (targetX < knife.x - 20) knife.vx -= agilityForce;
          if (targetX > knife.x + 20) knife.vx += agilityForce;
          
          // Balanced Oscillation (Balanço/Shake)
          const wobble = Math.sin(Date.now() / 400) * 0.2;
          knife.vx += wobble;
          
          const maxAirVX = 8 + agilityMultiplier * 7 + (level - 1) * 2;
          knife.vx = Math.max(-maxAirVX, Math.min(maxAirVX, knife.vx));

          knife.x += knife.vx;
          knife.y += knife.vy;
          knife.angle += knife.va;
        } else if (knife.isStuck) {
           knife.vx = 0;
           knife.vy = 0;
           knife.va = 0;
        }
          
          // Platform Collision
          objects.forEach(obj => {
            if ((obj.type === 'PLATFORM' || obj.type === 'LIFT') && obj.width && obj.height && obj.terrain) {
              const knifeTipX = knife.x;
              const knifeTipY = knife.y;
              
              if (knifeTipX > obj.x - obj.width/2 && knifeTipX < obj.x + obj.width/2) {
                // Find local surface Y
                const localX = knifeTipX - (obj.x - obj.width/2);
                const index = Math.floor(localX / TERRAIN_RES);
                const surfaceY = (Math.max(obj.y - obj.height/2, obj.y - obj.height/2) + ((obj.terrain[index] || 0) + (obj.terrain[index+1] || 0))/2);

                if (knifeTipY > surfaceY && knifeTipY < obj.y + obj.height/2 + 20) {
                  
                  const normalizedAngle = ((knife.angle % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
                  const isTipDown = Math.abs(normalizedAngle - Math.PI / 2) < 0.5 || activeSkills['perfect_stick'];

                  if (isTipDown && Math.random() < (knife.weapon.stickProbability || 0.5)) {
                    knife.y = surfaceY + 5;
                    knife.vx = 0; knife.vy = 0; knife.va = 0;
                    knife.isGrounded = true;
                    sounds.playStick();
                    
                    const weaponScale = (knife.weapon.edgeLength || 1);
                    deformIsland(obj, knife.x, 50 * weaponScale, 30);
                  } else {
                    knife.vy *= -knife.weapon.bounciness;
                    knife.y = surfaceY - 5;
                    sounds.playBounce();
                  }
                }
              }
            }
          });

          // Transversal Skill
          if (activeSkills['transversal'] && knife.vy > 0) {
            knife.angle = Math.PI / 4;
          }

          // Wall Collision
          const leftW_classic = getWallX(knife.y, 0, 'left');
          const rightW_classic = getWallX(knife.y, 15000, 'right'); // 15k ref
          if (knife.x < leftW_classic) {
            knife.x = leftW_classic;
            knife.vx *= -0.5;
            deformWall(knife.y, 50, 2, 'left');
          }
          if (knife.x > rightW_classic) {
            knife.x = rightW_classic;
            knife.vx *= -0.5;
            deformWall(knife.y, 50, 2, 'right');
          }

          const currentGroundY = getTerrainY(knife.x, GROUND_Y);
          if (knife.y > currentGroundY) {
            const normalizedAngle = ((knife.angle % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
            const angleToGround = Math.abs(normalizedAngle - Math.PI / 2);
            const isTipDown = angleToGround < 0.3; // Near 90 degrees
            
            const stickChance = knife.weapon.stickProbability;
            const stickSuccess = (isTipDown || activeSkills['perfect_stick']) && Math.random() < stickChance;
            
            if (stickSuccess) {
              knife.y = currentGroundY + 5; // Penetrate slightly
              knife.vx = 0; knife.vy = 0; knife.va = 0; knife.isGrounded = true;
              gameRef.current.shake = 5;
              sounds.playStick();

              const speed = Math.sqrt(knife.vx * knife.vx + (knife.vy - GRAVITY) * (knife.vy - GRAVITY));
              const isHeavyImpact = speed > 10 || gameRef.current.isSlamming;

              // Deform Terrain (Only for player)
              deformTerrain(knife.x, 60, 20 + (gameRef.current.isSlamming ? 30 : 0));

              // Add Crater Impact Feedback
              if (isHeavyImpact) {
                gameRef.current.impactMarks.push({
                  x: knife.x,
                  y: currentGroundY,
                  life: 1.0,
                  type: 'CRATER',
                  radius: 40 + Math.random() * 40 + (gameRef.current.isSlamming ? 60 : 0),
                  depth: 20 + Math.random() * 20 + (gameRef.current.isSlamming ? 30 : 0)
                });
                createParticles(knife.x, currentGroundY, '#E6D543', 15);
              }

              // Add Impact Mark
              gameRef.current.impactMarks.push({
                x: knife.x,
                y: currentGroundY,
                life: 1.0,
                type: Math.random() > 0.5 ? 'CRACK' : 'SHADOW'
              });

              if (gameRef.current.isSlamming) {
                gameRef.current.shake = 30;
                objects.forEach(obj => {
                  const dist = Math.sqrt((knife.x - obj.x)**2 + (knife.y - obj.y)**2);
                  if (dist < 250 && obj.type === 'FRUIT' && !obj.sliced) {
                    obj.sliced = true;
                    sounds.playSlice();
                    setScore(s => s + 20);
                    setXp(px => px + 35); // XP bonus for Slam
                    createParticles(obj.x, obj.y, obj.color);
                    createSlicedHalves(obj.x, obj.y, obj.label || '🍎', obj.color, obj.scale);
                  }
                });
                // Big Impact Mark
                for (let i = 0; i < 3; i++) {
                  gameRef.current.impactMarks.push({
                    x: knife.x + (Math.random() - 0.5) * 60,
                    y: GROUND_Y,
                    life: 1.5,
                    type: 'CRACK'
                  });
                }
              }
            } else {
              knife.y = GROUND_Y; knife.vy *= -knife.weapon.bounciness; knife.vx *= 0.8; knife.va *= -knife.weapon.bounciness;
              sounds.playBounce();
              if (Math.abs(knife.vy) < 1) setGameState('GAMEOVER');
            }
          }
        gameRef.current.cameraX = Math.max(gameRef.current.cameraX, knife.x - 200);
        objects.forEach(obj => {
          if (obj.sliced) return;
          
          if (obj.type === 'CARD') {
            obj.y += 2;
          }

          const dx = obj.x - knife.x;
          const dy = obj.y - knife.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          const collisionRadius = 40 * knife.weapon.edgeLength;
          
          // Check if hit is with blade or handle based on orientation
          const proj = dx * Math.cos(knife.angle) + dy * Math.sin(knife.angle);
          const isBladeHit = proj > 0;
          
          const isHandleHit = activeSkills['super_cut'] && dist < 60 && !isBladeHit;

          if (dist < collisionRadius || isHandleHit) {
            if (obj.type === 'FRUIT') {
              const speed = Math.sqrt(knife.vx * knife.vx + knife.vy * knife.vy);
              const canSlice = speed * knife.weapon.sharpnessFactor > 2 || activeSkills['super_hot'];
              if ((isBladeHit && canSlice) || activeSkills['super_hot'] || activeSkills['super_cut']) {
                obj.sliced = true;
                sounds.playSlice();
                const pointsMult = activeSkills['super_hot'] ? 2 : 1;
                setScore(s => s + Math.round(10 * knife.weapon.sweetSpotBonus * pointsMult));
                setXp(x => x + 40 * pointsMult); // XP increased (was 25)
                createParticles(obj.x, obj.y, obj.color);
                createSlicedHalves(obj.x, obj.y, obj.label || '🍎', obj.color, obj.scale);
                gameRef.current.shake = 10;
                knife.vx *= (1 - knife.weapon.penetrationLoss);
                knife.vy *= (1 - knife.weapon.penetrationLoss);
              } else {
                // Handle hit results in physics bounce
                const angle = Math.atan2(dy, dx);
                knife.vx = -Math.cos(angle) * 8;
                knife.vy = -Math.sin(angle) * 8;
                sounds.playBounce();
                gameRef.current.shake = 5;
              }
            } else if (obj.type === 'CARD') {
              obj.sliced = true;
              if (obj.cardType === 'SKILL' && obj.cardId) {
                const skill = SKILLS.find(s => s.id === obj.cardId);
                if (skill) {
                  gameRef.current.activeSkills[skill.id] = skill.duration;
                  window.dispatchEvent(new CustomEvent('itemPickup', {detail: {icon: skill.icon, title: 'SKILL ACQUIRED', name: skill.name, color: obj.color}}));
                  sounds.playLevelUp();
                }
              } else if (obj.cardType === 'WEAPON' && obj.cardId) {
                const weapon = WEAPON_PRESETS.find(w => w.id === obj.cardId);
                if (weapon) {
                  knife.weapon = weapon;
                  setSelectedWeapon(weapon);
                  window.dispatchEvent(new CustomEvent('itemPickup', {detail: {icon: weapon.icon, title: 'WEAPON EQUIPPED', name: weapon.name, color: obj.color}}));
                  sounds.playLevelUp();
                }
              }
              createParticles(obj.x, obj.y, obj.color, 20);
            } else if (obj.type === 'SPIKE' || obj.type === 'FINISH') {
              setGameState('GAMEOVER');
            }
          }
        });
        gameRef.current.particles = particles.filter(p => {
          p.x += p.vx; p.y += p.vy; p.vy += 0.2; p.life -= 0.02;
          return p.life > 0;
        });
        gameRef.current.slicedHalves = gameRef.current.slicedHalves.filter(h => {
          h.x += h.vx; h.y += h.vy; h.vy += GRAVITY; h.angle += h.va; h.life -= 0.01;
          return h.life > 0 && h.y < GROUND_Y + 200;
        });

        // Update Impact Marks
        gameRef.current.impactMarks = gameRef.current.impactMarks.filter(im => {
          im.life -= 0.005;
          return im.life > 0;
        });

        if (gameRef.current.shake > 0) gameRef.current.shake *= 0.9;
      }
    };

    const handleResize = () => {
      if (canvasRef.current) {
        canvasRef.current.width = window.innerWidth;
        canvasRef.current.height = window.innerHeight;
      }
    };

    window.addEventListener('resize', handleResize);
    handleResize();

    const drawBattle = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const { battlePlayers, battleFruits, particles, slicedHalves, arenaCameraY, cameraX, shake, objects } = gameRef.current;
      const isFreeArena = gameState === 'FREE_ARENA';
      const arenaW = isFreeArena ? FREE_ARENA_WIDTH : ARENA_WIDTH;
      const arenaH = isFreeArena ? FREE_ARENA_HEIGHT : ARENA_HEIGHT;

      ctx.save();
      if (shake > 0) ctx.translate((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake);
      ctx.translate(isFreeArena ? -cameraX : 0, -arenaCameraY);

      // Wall Sticking Highlight (Battle/Arena)
      const pPlayer = battlePlayers.find(p => p.id === 'player');
      if (pPlayer && !pPlayer.isGrounded && !pPlayer.isStuck) {
         const wallDist = 80;
         const angleTolerance = 0.8;
         const lx = getWallX(pPlayer.y, 0, 'left');
         const rx = getWallX(pPlayer.y, arenaW, 'right');
         
         let normalized = pPlayer.angle % (Math.PI * 2);
         if (normalized > Math.PI) normalized -= Math.PI * 2;
         if (normalized < -Math.PI) normalized += Math.PI * 2;

         const distL = pPlayer.x - lx;
         const distR = rx - pPlayer.x;
         
         ctx.save();
         ctx.lineWidth = 12;
         ctx.shadowBlur = 20;
         ctx.strokeStyle = 'rgba(255, 255, 255, 0.6)';
         ctx.shadowColor = '#FFF';

         if (distL < wallDist && Math.abs(Math.abs(normalized) - Math.PI) < angleTolerance) {
            ctx.beginPath();
            ctx.moveTo(lx, pPlayer.y - 60);
            ctx.lineTo(lx, pPlayer.y + 60);
            ctx.stroke();
         } else if (distR < wallDist && Math.abs(normalized) < angleTolerance) {
            ctx.beginPath();
            ctx.moveTo(rx, pPlayer.y - 60);
            ctx.lineTo(rx, pPlayer.y + 60);
            ctx.stroke();
         }
         ctx.restore();
      }

      // Draw Arena Background
      if (isFreeArena) {
        ctx.fillStyle = '#f8fafc';
        ctx.fillRect(0, 0, FREE_ARENA_WIDTH, FREE_ARENA_HEIGHT);
        // Grid for Free Arena
        ctx.strokeStyle = 'rgba(0,0,0,0.05)';
        ctx.lineWidth = 2;
        for (let x = 0; x < FREE_ARENA_WIDTH; x += 200) {
          ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, FREE_ARENA_HEIGHT); ctx.stroke();
        }
        for (let y = 0; y < FREE_ARENA_HEIGHT; y += 200) {
          ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(FREE_ARENA_WIDTH, y); ctx.stroke();
        }
        
        // Terrain Mesh (Free Arena)
        ctx.fillStyle = '#475569';
        ctx.beginPath();
        const startX_cam = Math.max(0, cameraX - 100);
        const endX_cam = Math.min(FREE_ARENA_WIDTH, cameraX + window.innerWidth + 100);
        ctx.moveTo(startX_cam, FREE_ARENA_HEIGHT + 3000);
        for (let x = startX_cam; x <= endX_cam; x += TERRAIN_RES) {
            ctx.lineTo(x, getTerrainY(x, FREE_ARENA_HEIGHT));
        }
        ctx.lineTo(endX_cam, FREE_ARENA_HEIGHT + 3000);
        ctx.fill();
        
        ctx.strokeStyle = '#2B2D42';
        ctx.lineWidth = 8;
        ctx.beginPath();
        ctx.moveTo(startX_cam, getTerrainY(startX_cam, FREE_ARENA_HEIGHT));
        for (let x = startX_cam; x <= endX_cam; x += TERRAIN_RES) {
            ctx.lineTo(x, getTerrainY(x, FREE_ARENA_HEIGHT));
        }
        ctx.stroke();
      } else {
        const gradient = ctx.createLinearGradient(0, 0, 0, ARENA_HEIGHT);
        gradient.addColorStop(0, '#1e293b'); // TOP
        gradient.addColorStop(0.5, '#334155'); // MIDDLE
        gradient.addColorStop(1, '#475569'); // BASE
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, ARENA_WIDTH, ARENA_HEIGHT);

        // Terrain Mesh (Battle Arena)
        ctx.fillStyle = '#1e293b';
        ctx.beginPath();
        ctx.moveTo(0, ARENA_HEIGHT + 3000);
        for (let x = 0; x <= ARENA_WIDTH; x += TERRAIN_RES) {
            ctx.lineTo(x, getTerrainY(x, ARENA_HEIGHT));
        }
        ctx.lineTo(ARENA_WIDTH, ARENA_HEIGHT + 3000);
        ctx.fill();

        ctx.strokeStyle = '#000';
        ctx.lineWidth = 8;
        ctx.beginPath();
        ctx.moveTo(0, getTerrainY(0, ARENA_HEIGHT));
        for (let x = TERRAIN_RES; x <= ARENA_WIDTH; x += TERRAIN_RES) {
            ctx.lineTo(x, getTerrainY(x, ARENA_HEIGHT));
        }
        ctx.stroke();

        // Left Wall Mesh
        ctx.fillStyle = '#1e293b';
        ctx.beginPath();
        ctx.moveTo(-200, 0);
        for (let y = 0; y <= ARENA_HEIGHT; y += TERRAIN_RES) {
            ctx.lineTo(getWallX(y, 0, 'left'), y);
        }
        ctx.lineTo(-200, ARENA_HEIGHT);
        ctx.fill();
        ctx.strokeStyle = '#000';
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.moveTo(getWallX(0, 0, 'left'), 0);
        for (let y = TERRAIN_RES; y <= ARENA_HEIGHT; y += TERRAIN_RES) {
            ctx.lineTo(getWallX(y, 0, 'left'), y);
        }
        ctx.stroke();

        // Right Wall Mesh
        ctx.fillStyle = '#1e293b';
        ctx.beginPath();
        ctx.moveTo(ARENA_WIDTH + 200, 0);
        for (let y = 0; y <= ARENA_HEIGHT; y += TERRAIN_RES) {
            ctx.lineTo(getWallX(y, ARENA_WIDTH, 'right'), y);
        }
        ctx.lineTo(ARENA_WIDTH + 200, ARENA_HEIGHT);
        ctx.fill();
        ctx.strokeStyle = '#000';
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.moveTo(getWallX(0, ARENA_WIDTH, 'right'), 0);
        for (let y = TERRAIN_RES; y <= ARENA_HEIGHT; y += TERRAIN_RES) {
            ctx.lineTo(getWallX(y, ARENA_WIDTH, 'right'), y);
        }
        ctx.stroke();

        // Draw Zone Markers
        ctx.strokeStyle = 'rgba(255,255,255,0.1)';
        ctx.setLineDash([20, 20]);
        ctx.beginPath();
        ctx.moveTo(0, ARENA_HEIGHT + 3000);
        ctx.lineTo(ARENA_WIDTH, ARENA_HEIGHT + 3000);
        ctx.moveTo(0, ARENA_HEIGHT * 0.7); ctx.lineTo(ARENA_WIDTH, ARENA_HEIGHT * 0.7);
        ctx.stroke();
        ctx.setLineDash([]);
      }

      // Draw Impact Marks
      gameRef.current.impactMarks.forEach(im => {
        ctx.save();
        ctx.globalAlpha = im.life;
        ctx.translate(im.x, im.y);
        
        if (im.type === 'SHADOW') {
          ctx.fillStyle = 'rgba(0,0,0,0.1)';
          ctx.beginPath();
          ctx.ellipse(0, 0, 30 * im.life, 10 * im.life, 0, 0, Math.PI * 2);
          ctx.fill();
        } else if (im.type === 'CRACK') {
          ctx.strokeStyle = 'rgba(43, 45, 66, ' + im.life + ')';
          ctx.lineWidth = 2 * im.life;
          ctx.beginPath();
          ctx.moveTo(-10, 0); ctx.lineTo(10, 0);
          ctx.moveTo(0, -5); ctx.lineTo(0, 5);
          ctx.stroke();
        } else if (im.type === 'CRATER' && im.radius && im.depth) {
          // Simple crater effect
          ctx.fillStyle = 'rgba(0,0,0,0.3)';
          ctx.beginPath();
          ctx.ellipse(0, 5, im.radius * 0.8 * im.life, im.depth * 0.4 * im.life, 0, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.restore();
      });

      // Draw Fruits
      battleFruits.forEach(f => {
        drawDimensionalFruit(ctx, f.x, f.y, f.label || '🍎', f.color, f.scale);
      });

      // Draw Islands/Platforms
      objects.forEach(obj => {
        if ((obj.type === 'PLATFORM' || obj.type === 'LIFT') && obj.width && obj.height && obj.terrain) {
          ctx.save();
          ctx.translate(obj.x - obj.width/2, obj.y - obj.height/2);
          
          ctx.fillStyle = obj.type === 'LIFT' ? '#fbbf24' : '#475569';
          ctx.strokeStyle = '#2B2D42';
          ctx.lineWidth = 4;
          
          ctx.beginPath();
          ctx.moveTo(0, obj.height);
          
          // Draw the deformed top surface
          for (let i = 0; i < obj.terrain.length; i++) {
              ctx.lineTo(i * TERRAIN_RES, obj.terrain[i]);
          }
          
          // Drop down to the bottom
          ctx.lineTo(obj.width, obj.height);
          
          // Draw a curved/bumpy bottom to make it look like an island
          ctx.quadraticCurveTo(obj.width * 0.75, obj.height + 40, obj.width * 0.5, obj.height + 20);
          ctx.quadraticCurveTo(obj.width * 0.25, obj.height + 40, 0, obj.height);
          
          ctx.closePath();
          ctx.fill();
          ctx.stroke();
          
          // Grass on top
          ctx.fillStyle = obj.type === 'LIFT' ? '#f59e0b' : '#38bdf8';
          ctx.beginPath();
          ctx.moveTo(0, obj.terrain[0] || 0);
          for (let i = 0; i < obj.terrain.length; i++) {
              ctx.lineTo(i * TERRAIN_RES, obj.terrain[i]);
          }
          ctx.lineTo(obj.width, (obj.terrain[obj.terrain.length-1] || 0) + 10);
          for (let i = obj.terrain.length - 1; i >= 0; i--) {
              ctx.lineTo(i * TERRAIN_RES, obj.terrain[i] + 10);
          }
          ctx.closePath();
          ctx.fill();

          ctx.restore();
        }
      });

      // Draw Cards
      objects.forEach(obj => {
        if (obj.type === 'CARD' && !obj.sliced) {
          let label = obj.label || '?';
          // Ensure weapon cards show the weapon icon
          if (obj.cardType === 'WEAPON' && obj.cardId) {
            const wep = WEAPON_PRESETS.find(w => w.id === obj.cardId);
            if (wep) label = wep.icon;
          }
          // Draw as a spherical orb instead of a flat card
          drawDimensionalFruit(ctx, obj.x, obj.y, label, obj.color, 1.2);
        }
      });

      // Draw Particles & Halves
      particles.forEach(p => {
        ctx.globalAlpha = p.life; ctx.fillStyle = p.color;
        ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2); ctx.fill();
      });
      ctx.globalAlpha = 1;
      slicedHalves.forEach((h, i) => {
        ctx.save(); ctx.globalAlpha = h.life; ctx.translate(h.x, h.y); ctx.rotate(h.angle);
        ctx.beginPath();
        if (i % 2 === 0) ctx.rect(-50, -50, 50, 100); else ctx.rect(0, -50, 50, 100);
        ctx.clip(); 
        drawDimensionalFruit(ctx, 0, 0, h.label, h.color, h.scale);
        ctx.restore();
      });

      // Draw Players
      battlePlayers.forEach(p => {
        if (p.respawnTimer > 0) return;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.scale(p.scale || 1, p.scale || 1);
        ctx.rotate(p.angle);
        
        // HP Bar (Above character) — larger and clearly visible
        ctx.save();
        ctx.rotate(-p.angle);
        // Black background
        ctx.fillStyle = 'rgba(0,0,0,0.7)';
        ctx.fillRect(-35, -72, 70, 10);
        // Red empty slot
        ctx.fillStyle = '#c0392b';
        ctx.fillRect(-35, -72, 70, 10);
        // Green HP fill
        const displayHpValue = p.displayHp !== undefined ? p.displayHp : (p.hp || 0);
        const currentMaxHp = p.maxHp || 100;
        const hpRatio = Math.max(0, Math.min(1, displayHpValue / currentMaxHp));
        const hpColor = hpRatio > 0.5 ? '#2ecc71' : hpRatio > 0.25 ? '#f39c12' : '#e74c3c';
        ctx.fillStyle = hpColor;
        ctx.fillRect(-35, -72, hpRatio * 70, 10);
        // White border
        ctx.strokeStyle = 'rgba(255,255,255,0.8)';
        ctx.lineWidth = 1;
        ctx.strokeRect(-35, -72, 70, 10);
        // HP text
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 9px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(`${Math.ceil(displayHpValue)}/${currentMaxHp}`, 0, -64);
        ctx.restore();

        // Name Tag
        ctx.save();
        ctx.rotate(-p.angle);
        ctx.font = '900 16px sans-serif';
        ctx.textAlign = 'center';
        ctx.lineWidth = 4;
        ctx.strokeStyle = 'rgba(255,255,255,0.8)';
        ctx.strokeText(`${p.name}`, 0, -82);
        ctx.fillStyle = isFreeArena ? '#1e293b' : '#000';
        ctx.fillText(`${p.name}`, 0, -82);
        ctx.restore();

        const weapon = p.weapon;
        const scale = weapon.edgeLength;
        const handleLen = 30;
        const bladeLen = 60 * scale;
        const totalLen = handleLen + bladeLen;
        const pivotX = -handleLen + weapon.centerOfGravity * totalLen;
        ctx.translate(-pivotX, 0);

        drawKnife(ctx, weapon, handleLen, bladeLen);
        ctx.restore();
      });

      ctx.restore();
    };

    const drawDimensionalFruit = (ctx: CanvasRenderingContext2D, x: number, y: number, label: string, color: string, scale: number = 1) => {
      ctx.save();
      ctx.translate(x, y);
      ctx.scale(scale, scale);
      
      // Shadow
      ctx.fillStyle = 'rgba(0,0,0,0.2)';
      ctx.beginPath();
      ctx.ellipse(0, 25, 20, 10, 0, 0, Math.PI * 2);
      ctx.fill();

      // Main Body (3D Sphere effect)
      const grad = ctx.createRadialGradient(-8, -8, 2, 0, 0, 28);
      grad.addColorStop(0, '#FFF');
      grad.addColorStop(0.3, color);
      grad.addColorStop(0.8, color);
      grad.addColorStop(1, 'rgba(0,0,0,0.4)');
      
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(0, 0, 25, 0, Math.PI * 2);
      ctx.fill();

      // Highlight (Glossy look)
      ctx.fillStyle = 'rgba(255,255,255,0.4)';
      ctx.beginPath();
      ctx.ellipse(-10, -10, 8, 5, Math.PI / 4, 0, Math.PI * 2);
      ctx.fill();

      // Rim Light
      ctx.strokeStyle = 'rgba(255,255,255,0.2)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(0, 0, 24, 0, Math.PI * 2);
      ctx.stroke();

      // Emoji Label (slightly smaller and centered)
      ctx.font = '30px serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(label, 0, 0);

      ctx.restore();
    };

    const drawCard = (ctx: CanvasRenderingContext2D, x: number, y: number, label: string, color: string, type: string) => {
      ctx.save();
      ctx.translate(x, y);
      
      // Card Body
      ctx.fillStyle = '#FFF';
      ctx.shadowBlur = 0;
      ctx.beginPath();
      ctx.roundRect(-30, -45, 60, 90, 10);
      ctx.fill();
      ctx.shadowBlur = 0;

      // Border
      ctx.strokeStyle = color;
      ctx.lineWidth = 4;
      ctx.stroke();

      // Header
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.roundRect(-30, -45, 60, 25, [10, 10, 0, 0]);
      ctx.fill();

      // Icon
      const isSaw = label === '🪚';
      const isWideEmoji = ['🌀', '🌌', '🚀'].includes(label || '');
      ctx.font = isSaw ? '42px serif' : (isWideEmoji ? '32px serif' : '40px serif');
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(label || '', 0, isSaw ? 5 : (isWideEmoji ? 10 : 15));

      // Type Text
      ctx.fillStyle = '#FFF';
      ctx.font = 'bold 8px sans-serif';
      ctx.fillText(type === 'SKILL' ? 'SKILL' : 'WEAPON', 0, -32);

      ctx.restore();
    };

    const drawKnife = (ctx: CanvasRenderingContext2D, weapon: WeaponConfig, handleLen: number, bladeLen: number) => {
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';

      // Check for Sprite support
      if (weapon.spriteUrl) {
        const imgKey = `weapon_${weapon.id}`;
        if (!gameRef.current.images) gameRef.current.images = {};
        
        let img = gameRef.current.images[imgKey];
        if (!img) {
          img = new Image();
          img.src = weapon.spriteUrl;
          img.crossOrigin = "anonymous";
          gameRef.current.images[imgKey] = img;
        }

        if (img.complete && img.naturalWidth > 0) {
          ctx.save();
          // Adjust for pivot point (weapon.centerOfGravity)
          // The sprite should be centered horizontally and vertically
          const totalLen = handleLen + bladeLen;
          ctx.rotate(Math.PI / 2); // Rotate to stand upright for the sprite if needed
          const spriteSize = 100 * (weapon.edgeLength || 1);
          ctx.drawImage(img, -spriteSize/2, -spriteSize/2, spriteSize, spriteSize);
          ctx.restore();
          return;
        }
      }
      
      // Evolution effects
      const isEvolved = level > 1;
      const evolutionPower = Math.min(level, 10) / 10;
      
      const drawBlade = (width: number, height: number, color = '#FFF', glow = false) => {
        const activeSkills = gameRef.current.activeSkills;
        const isSuperHot = activeSkills['super_hot'];
        
        if (glow || isEvolved || isSuperHot) { 
          ctx.shadowBlur = 0; 
          ctx.shadowColor = isSuperHot ? '#ff4500' : (isEvolved ? '#FFED4A' : weapon.color); 
        }
        
        ctx.fillStyle = isSuperHot ? '#ff4500' : color; 
        ctx.beginPath();
        ctx.moveTo(0, -height/2); 
        ctx.lineTo(width - 10, -height/2); 
        ctx.lineTo(width, 0); 
        ctx.lineTo(width - 10, height/2); 
        ctx.lineTo(0, height/2);
        ctx.closePath(); 
        ctx.fill(); 
        
        // Blade Shine Effect
        if (isEvolved) {
          const gradient = ctx.createLinearGradient(0, -height/2, 0, height/2);
          gradient.addColorStop(0, 'rgba(255,255,255,0.8)');
          gradient.addColorStop(0.5, 'rgba(255,255,255,0)');
          gradient.addColorStop(1, 'rgba(255,255,255,0.3)');
          ctx.fillStyle = gradient;
          ctx.fill();
          
          // Sparkles
          if (Math.random() < 0.1 * evolutionPower) {
            const sx = Math.random() * width;
            const sy = (Math.random() - 0.5) * height;
            ctx.fillStyle = '#FFF';
            ctx.beginPath();
            ctx.arc(sx, sy, 2, 0, Math.PI * 2);
            ctx.fill();
          }
        }

        ctx.strokeStyle = '#2B2D42'; 
        ctx.lineWidth = 2 + (level * 0.2); 
        ctx.stroke(); 
        ctx.shadowBlur = 0;
      };
      const drawHandle = (length: number, height: number) => {
        ctx.fillStyle = weapon.color; ctx.fillRect(-length, -height/2, length, height);
        ctx.strokeStyle = '#2B2D42'; ctx.lineWidth = 2; ctx.strokeRect(-length, -height/2, length, height);
      };

      // More complete drawing logic for battle
      // Evolution Path Overrides
      let currentWeapon = weapon;
      if (evolutionPath === 'SWORD') {
        currentWeapon = WEAPON_PRESETS.find(w => w.id === 'longsword') || weapon;
      } else if (evolutionPath === 'SAW') {
        currentWeapon = WEAPON_PRESETS.find(w => w.id === 'handsaw') || weapon;
      }

      switch(currentWeapon.id) {
        case 'katana': drawHandle(handleLen, 10); drawBlade(bladeLen, 6); break;
        case 'cleaver': drawHandle(handleLen * 1.5, 8); ctx.fillStyle = '#FFF'; ctx.beginPath(); ctx.moveTo(0, -20); ctx.lineTo(30, -30); ctx.lineTo(35, 30); ctx.lineTo(0, 20); ctx.closePath(); ctx.fill(); ctx.stroke(); break;
        case 'mjolnir': drawHandle(handleLen * 1.2, 12); ctx.fillStyle = '#94a3b8'; ctx.fillRect(0, -25, 40, 50); ctx.strokeRect(0, -25, 40, 50); break;
        case 'lightsaber': drawHandle(handleLen, 12); drawBlade(bladeLen, 10, weapon.color, true); break;
        case 'chainsaw': drawHandle(handleLen, 15); ctx.fillStyle = '#ef4444'; ctx.fillRect(0, -15, 80, 30); ctx.strokeRect(0, -15, 80, 30); break;
        default: drawHandle(handleLen, 10); drawBlade(bladeLen, 10); break;
      }
    };

    const draw = () => {
      if (gameState === 'BATTLE' || gameState === 'FREE_ARENA') {
        drawBattle();
      } else {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        const { knife, cameraX, objects, particles, slicedHalves, shake } = gameRef.current;
        ctx.save();
        if (shake > 0) ctx.translate((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake);
        ctx.translate(-cameraX, 0);

        // Wall Sticking Highlight (Classic)
        if (!knife.isGrounded && !knife.isStuck) {
           const wallDist = 100;
           const angleTolerance = 0.8;
           const lx = getWallX(knife.y, 0, 'left');
           const rx = getWallX(knife.y, 15000, 'right');
           
           let normalized = knife.angle % (Math.PI * 2);
           if (normalized > Math.PI) normalized -= Math.PI * 2;
           if (normalized < -Math.PI) normalized += Math.PI * 2;

           const distL = knife.x - lx;
           const distR = rx - knife.x;
           
           ctx.save();
           ctx.lineWidth = 12;
           ctx.shadowBlur = 20;
           ctx.strokeStyle = 'rgba(255, 255, 255, 0.6)';
           ctx.shadowColor = '#FFF';

           if (distL < wallDist && Math.abs(Math.abs(normalized) - Math.PI) < angleTolerance) {
              ctx.beginPath();
              ctx.moveTo(lx, knife.y - 60);
              ctx.lineTo(lx, knife.y + 60);
              ctx.stroke();
           } else if (distR < wallDist && Math.abs(normalized) < angleTolerance) {
              ctx.beginPath();
              ctx.moveTo(rx, knife.y - 60);
              ctx.lineTo(rx, knife.y + 60);
              ctx.stroke();
           }
           ctx.restore();
        }

        // Draw Terrain Mesh (Classic Mode)
        ctx.fillStyle = '#475569'; // Dark gray
        ctx.beginPath();
        const startX_draw = Math.max(0, cameraX - 100);
        const endX_draw = Math.min(15000, cameraX + canvas.width + 100); // 15k ref
        ctx.moveTo(startX_draw, GROUND_Y + 3000);
        for (let x = startX_draw; x <= endX_draw; x += TERRAIN_RES) {
            ctx.lineTo(x, getTerrainY(x, GROUND_Y));
        }
        ctx.lineTo(endX_draw, GROUND_Y + 3000);
        ctx.fill();

        // Ground Edge
        ctx.strokeStyle = '#2B2D42';
        ctx.lineWidth = 6;
        ctx.beginPath();
        ctx.moveTo(startX_draw, getTerrainY(startX_draw, GROUND_Y));
        for (let x = startX_draw; x <= endX_draw; x += TERRAIN_RES) {
            ctx.lineTo(x, getTerrainY(x, GROUND_Y));
        }
        ctx.stroke();

        // Draw Impact Marks
        gameRef.current.impactMarks.forEach(im => {
          ctx.save();
          ctx.globalAlpha = im.life;
          ctx.translate(im.x, im.y);
          
          if (im.type === 'SHADOW') {
            ctx.fillStyle = 'rgba(0,0,0,0.1)';
            ctx.beginPath();
            ctx.ellipse(0, 0, 30 * im.life, 10 * im.life, 0, 0, Math.PI * 2);
            ctx.fill();
          } else if (im.type === 'CRACK') {
            ctx.strokeStyle = 'rgba(43, 45, 66, ' + im.life + ')';
            ctx.lineWidth = 2 * im.life;
            ctx.beginPath();
            ctx.moveTo(-10, 0); ctx.lineTo(10, 0);
            ctx.moveTo(0, -5); ctx.lineTo(0, 5);
            ctx.stroke();
          } else if (im.type === 'CRATER') {
             // Simple crater effect (dark circle) without mesh deformation
             ctx.fillStyle = 'rgba(0,0,0,0.2)';
             ctx.beginPath();
             ctx.ellipse(0, 5, 40 * im.life, 10 * im.life, 0, 0, Math.PI * 2);
             ctx.fill();
          }
          ctx.restore();
        });

        // Left Wall Mesh (Classic)
        ctx.fillStyle = '#1e293b';
        ctx.beginPath();
        ctx.moveTo(-200, 0);
        for (let y = 0; y <= GROUND_Y + 500; y += TERRAIN_RES) {
            ctx.lineTo(getWallX(y, 0, 'left'), y);
        }
        ctx.lineTo(-200, GROUND_Y + 500);
        ctx.fill();
        ctx.strokeStyle = '#000';
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.moveTo(getWallX(0, 0, 'left'), 0);
        for (let y = TERRAIN_RES; y <= GROUND_Y + 500; y += TERRAIN_RES) {
            ctx.lineTo(getWallX(y, 0, 'left'), y);
        }
        ctx.stroke();

        // Right Wall Mesh (Classic Limit)
        // Classic mode doesn't usually have a right wall but I added one at 15k just in case
        ctx.fillStyle = '#1e293b';
        ctx.beginPath();
        const rLimit = 15000;
        ctx.moveTo(rLimit + 200, 0);
        for (let y = 0; y <= GROUND_Y + 500; y += TERRAIN_RES) {
            ctx.lineTo(getWallX(y, rLimit, 'right'), y);
        }
        ctx.lineTo(rLimit + 200, GROUND_Y + 500);
        ctx.fill();

        objects.forEach(obj => {
          if (obj.sliced) return;
          if (obj.type === 'FRUIT') { 
            drawDimensionalFruit(ctx, obj.x, obj.y, obj.label || '🍎', obj.color, obj.scale);
          }
          else if (obj.type === 'PLATFORM' || obj.type === 'LIFT') {
            if (obj.width && obj.height) {
              ctx.save();
              ctx.translate(obj.x, obj.y);
              ctx.fillStyle = obj.type === 'LIFT' ? '#fbbf24' : '#475569';
              ctx.fillRect(-obj.width/2, -obj.height/2, obj.width, obj.height);
              ctx.strokeStyle = '#2B2D42';
              ctx.lineWidth = 3;
              ctx.strokeRect(-obj.width/2, -obj.height/2, obj.width, obj.height);
              ctx.restore();
            }
          }
          else if (obj.type === 'CARD') {
            // Draw as a spherical orb instead of a flat card
            drawDimensionalFruit(ctx, obj.x, obj.y, obj.label || '?', obj.color, 1.2);
          }
          else if (obj.type === 'SPIKE') { 
            const spikeY = getTerrainY(obj.x, GROUND_Y);
            ctx.fillStyle = obj.color; 
            ctx.beginPath(); 
            ctx.moveTo(obj.x - 20, spikeY); 
            ctx.lineTo(obj.x, spikeY - 40); 
            ctx.lineTo(obj.x + 20, spikeY); 
            ctx.fill(); 
          }
          else if (obj.type === 'FINISH') { 
            const finishY = getTerrainY(obj.x, GROUND_Y);
            ctx.fillStyle = obj.color; 
            ctx.fillRect(obj.x - 10, finishY - 100, 20, 100); 
            ctx.fillStyle = '#fff'; 
            ctx.fillRect(obj.x + 10, finishY - 100, 40, 30); 
            ctx.strokeStyle = '#000'; 
            ctx.strokeRect(obj.x + 10, finishY - 100, 40, 30); 
          }
        });
        particles.forEach(p => { ctx.globalAlpha = p.life; ctx.fillStyle = p.color; ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2); ctx.fill(); });
        ctx.globalAlpha = 1;
        slicedHalves.forEach((h, i) => { 
          ctx.save(); ctx.globalAlpha = h.life; ctx.translate(h.x, h.y); ctx.rotate(h.angle); 
          ctx.scale(h.scale || 1, h.scale || 1);
          ctx.beginPath(); 
          if (i % 2 === 0) ctx.rect(-50, -50, 50, 100); else ctx.rect(0, -50, 50, 100); 
          ctx.clip(); 
          drawDimensionalFruit(ctx, 0, 0, h.label, h.color, h.scale);
          ctx.restore(); 
        });
        ctx.globalAlpha = 1;
        ctx.save(); ctx.translate(knife.x, knife.y); ctx.rotate(knife.angle);
        const weapon = knife.weapon; const scale = weapon.edgeLength; const handleLen = 30; const bladeLen = 60 * scale; const totalLen = handleLen + bladeLen; const pivotX = -handleLen + weapon.centerOfGravity * totalLen;
        ctx.translate(-pivotX, 0);
        drawKnife(ctx, weapon, handleLen, bladeLen);
        ctx.restore();
        ctx.restore();
      }
      update();
      animationFrameId = requestAnimationFrame(draw);
    };

    draw();

    return () => {
      cancelAnimationFrame(animationFrameId);
      window.removeEventListener('resize', handleResize);
    };
  }, [gameState, level, evolutionPath]);

  useEffect(() => {
    if (xp >= maxXP) {
      setXp(0);
      setLevel(l => {
        const newLevel = l + 1;
        sounds.playLevelUp();

        // Increase Max Energy with levels
        const newMaxEnergy = 100 + (newLevel - 1) * 10;
        setMaxEnergy(newMaxEnergy);
        gameRef.current.knife.maxEnergy = newMaxEnergy;
        gameRef.current.knife.energy = newMaxEnergy;
        
        if (newLevel % 3 === 0) {
          const groupID = Math.random().toString(36).substr(2, 9);
          const expiresAt = Date.now() + 7000;
          const randomSkill = SKILLS[Math.floor(Math.random() * SKILLS.length)];
          
          const currentNode = EVOLUTION_TREE[currentPath];
          const choiceNodes = currentNode.children.map(id => EVOLUTION_TREE[id]);
          
          // Exactly 2 choices per user request
          const choices: ChoiceCard[] = [
            { id: Math.random().toString(), groupID, type: 'SKILL', data: randomSkill, expiresAt },
          ];

          if (choiceNodes.length > 0) {
             // Pick one child randomly if multiple exist
             const randomChild = choiceNodes[Math.floor(Math.random() * choiceNodes.length)];
             choices.push({ id: Math.random().toString(), groupID, type: 'EVOLUTION', data: randomChild, expiresAt });
          } else {
             // Leaf node: offer weapons from this branch or random mythic
             const currentWeapons = currentNode.weapons.map(wid => WEAPON_PRESETS.find(w => w.id === wid)).filter(Boolean);
             const randomWep = currentWeapons[Math.floor(Math.random() * currentWeapons.length)];
             choices.push({ id: Math.random().toString(), groupID, type: 'EVOLUTION', data: randomWep, expiresAt });
          }
          
          setActiveChoiceCards(prev => [...prev, ...choices]);
        }
        return newLevel;
      });
      setMaxXP(m => Math.floor(m * 1.5));
      // Visual feedback for level up
      gameRef.current.shake = 20;
    }
  }, [xp, maxXP]);

  useEffect(() => {
    if (score > highScore) {
      setHighScore(score);
    }
  }, [score, highScore]);

  const handleChoiceClick = (choice: ChoiceCard) => {
    if (choice.type === 'SKILL') {
      const skill = choice.data as Skill;
      gameRef.current.activeSkills[skill.id] = skill.duration;
      sounds.playLevelUp();
    } else {
      const node = choice.data as EvolutionNode;
      if (node.weapons) {
         setCurrentPath(node.id);
         const bestWeaponId = node.weapons[node.weapons.length - 1];
         const weapon = WEAPON_PRESETS.find(w => w.id === bestWeaponId);
         if (weapon) {
           setSelectedWeapon(weapon);
           if (gameState === 'PLAYING') gameRef.current.knife.weapon = weapon;
           else if (gameState === 'BATTLE' || gameState === 'FREE_ARENA') {
             const p = gameRef.current.battlePlayers.find(pl => pl.id === 'player');
             if (p) p.weapon = weapon;
           }
         }
      }
      sounds.playLevelUp();
    }
    // Remove all cards in the same level-up group
    setActiveChoiceCards(prev => prev.filter(c => c.groupID !== choice.groupID));
  };

  const startGame = () => {
    initLevel();
    setGameState('PLAYING');
  };

  const startBattle = () => {
    initBattle();
    setGameState('BATTLE');
  };

  const startFreeArena = () => {
    initFreeArena();
    setGameState('FREE_ARENA');
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div 
      className="relative w-full h-screen overflow-hidden font-sans select-none touch-none" 
      onPointerDown={handleMouseDown}
      onPointerUp={handleMouseUp}
      onPointerMove={handleMouseMove}
    >
      {/* Background Elements (REMOVED) */}

      {/* Game Canvas */}
      <canvas
        ref={canvasRef}
        width={window.innerWidth}
        height={window.innerHeight}
        className="block w-full h-full cursor-pointer"
      />

      {/* UI Overlay */}
      {(gameState === 'PLAYING' || gameState === 'BATTLE' || gameState === 'FREE_ARENA') && (
        <div className="absolute top-0 left-0 w-full p-8 flex justify-between items-center pointer-events-none bg-transparent z-20">
          <div className="flex items-center gap-4">
          <div className="flex flex-col gap-1">
            <motion.div 
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              className="vibrant-pill"
            >
              <span className="text-sm font-bold text-vibrant-dark/40 uppercase tracking-widest mr-2">Score</span>
              <span className="tabular-nums">{score}</span>
            </motion.div>
            
            {/* Level Bar */}
            <div className="w-full bg-vibrant-dark/10 h-4 rounded-full overflow-hidden border-2 border-vibrant-dark/20 mt-1">
              <motion.div 
                className="h-full bg-vibrant-green"
                initial={{ width: 0 }}
                animate={{ width: `${(xp / maxXP) * 100}%` }}
              />
            </div>
            
            {/* Energy Bar */}
            <div className="w-full bg-vibrant-dark/10 h-4 rounded-full overflow-hidden border-2 border-vibrant-dark/20 mt-1">
              <motion.div 
            className="h-full bg-vibrant-red"
            initial={{ width: '100%' }}
            animate={{ 
              width: `${(energy / maxEnergy) * 100}%`,
              opacity: energy < 20 ? [1, 0.5, 1] : 1
            }}
            transition={energy < 20 ? { duration: 0.2, repeat: Infinity } : { duration: 0.1 }}
          />
        </div>

            {/* HP Bar */}
            <div className="w-full bg-vibrant-dark/10 h-4 rounded-full overflow-hidden border-2 border-vibrant-dark/20 mt-1">
              <motion.div 
                className="h-full bg-vibrant-green"
                initial={{ width: '100%' }}
                animate={{ 
                  width: `${(hp / maxHp) * 100}%`,
                  backgroundColor: hp < 30 ? '#ef4444' : '#22c55e'
                }}
              />
            </div>

            <div className="flex justify-between text-[10px] font-black uppercase text-vibrant-dark/80">
              <span>LVL {level}</span>
              <div className="flex gap-2">
                <span>HP {Math.round(hp)}%</span>
                <span>ENRG {Math.round(energy)}%</span>
                <span>XP {Math.floor((xp / maxXP) * 100)}%</span>
              </div>
            </div>
          </div>
          
          <motion.div 
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.1 }}
            className="vibrant-pill !text-vibrant-green"
          >
            <Trophy className="w-6 h-6" />
            <span className="tabular-nums">{highScore}</span>
          </motion.div>
        </div>

        <div className="absolute top-4 sm:top-6 right-4 sm:right-8 flex items-center gap-4 pointer-events-auto z-[60]">
           <button 
             onClick={() => { sounds.playUIClick(); setShowTree(true); }}
             className="bg-transparent p-4 rounded-full shadow-lg border-4 border-vibrant-dark hover:bg-vibrant-yellow/20 transition-colors"
           >
             <Sword className="w-8 h-8 text-vibrant-dark" />
           </button>
           <button 
             onClick={() => { sounds.playUIClick(); setShowSettings(true); }}
             className="bg-transparent p-4 rounded-full shadow-lg border-4 border-vibrant-dark hover:bg-vibrant-yellow/20 transition-colors"
           >
             <Settings className="w-8 h-8 text-vibrant-dark" />
           </button>
        </div>
        </div>
      )}

      {/* Choice Cards Sidebar (Real-time) */}
      <div className="absolute top-24 sm:top-32 left-4 sm:left-8 flex flex-col gap-3 z-40 w-full max-w-[200px] sm:max-w-xs pointer-events-none max-h-[75vh] overflow-y-auto no-scrollbar py-4">
        <AnimatePresence>
          {activeChoiceCards.map((card) => (
            <motion.button 
              key={card.id}
              initial={{ x: -200, opacity: 0, scale: 0.8 }}
              animate={{ x: 0, opacity: 1, scale: 1 }}
              exit={{ x: -200, opacity: 0, scale: 0.8 }}
              onClick={(e) => {
                e.stopPropagation();
                sounds.playUIClick();
                handleChoiceClick(card);
              }}
              className={`pointer-events-auto group relative w-full flex-shrink-0 bg-white border-[4px] sm:border-[6px] rounded-[1.5rem] sm:rounded-[2.5rem] p-3 sm:p-5 shadow-[8px_8px_0_rgba(0,0,0,0.1)] sm:shadow-[12px_12px_0_rgba(0,0,0,0.2)] hover:scale-105 active:scale-95 transition-all text-left overflow-hidden min-h-[70px] sm:min-h-[100px] ${
                card.type === 'SKILL' ? 'border-vibrant-yellow bg-vibrant-yellow/5' : 'border-vibrant-dark bg-vibrant-dark/5'
              }`}
            >
              <div className="flex items-center gap-3 sm:gap-6">
                <div className="text-3xl sm:text-5xl drop-shadow-lg group-hover:rotate-12 transition-transform shrink-0 self-center">{card.data.icon}</div>
                <div className="flex-1 min-w-0 flex flex-col justify-center py-1">
                  <div className={`text-[9px] sm:text-[10px] font-black uppercase tracking-widest mb-0.5 sm:mb-1 ${
                    card.type === 'SKILL' ? 'text-vibrant-yellow' : 'text-vibrant-dark/60'
                  }`}>
                    {card.type === 'SKILL' ? '✨ HABILIDADE' : '⚔️ EVOLUÇÃO'}
                  </div>
                  <h3 className="text-xs sm:text-xl font-black text-vibrant-dark uppercase leading-tight italic tracking-tighter truncate">
                    {card.data.name}
                  </h3>
                  <p className="hidden md:block text-[10px] sm:text-xs font-bold text-vibrant-dark/60 leading-tight mt-0.5 sm:mt-1 line-clamp-2">
                    {card.data.description}
                  </p>
                </div>
              </div>
              
              {/* Expiry Progress Bar */}
              <div className="absolute bottom-0 left-0 w-full h-1 sm:h-2 bg-vibrant-dark/5">
                <motion.div 
                  className={`h-full ${card.type === 'SKILL' ? 'bg-vibrant-yellow' : 'bg-vibrant-dark'}`}
                  initial={{ width: '100%' }}
                  animate={{ width: '0%' }}
                  transition={{ duration: (card.expiresAt - Date.now()) / 1000, ease: 'linear' }}
                />
              </div>
            </motion.button>
          ))}
        </AnimatePresence>
      </div>

      {/* Active Skills UI */}
      <div className="absolute top-32 right-8 flex flex-col gap-2 pointer-events-none">
        {activeSkillsUI.map(id => {
          const skill = SKILLS.find(s => s.id === id);
          if (!skill) return null;
          return (
            <motion.div 
              key={id}
              initial={{ x: -50, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: -50, opacity: 0 }}
              className="bg-transparent text-vibrant-dark px-5 py-3 rounded-2xl flex items-center gap-4 border-4 border-vibrant-dark shadow-[6px_6px_0_rgba(0,0,0,0.1)] transition-all"
            >
              <span className="text-3xl">{skill.icon}</span>
              <div className="flex flex-col">
                <span className="font-black uppercase text-xs tracking-tight">{skill.name}</span>
                <div className="w-24 h-2 bg-vibrant-dark/10 rounded-full mt-1 overflow-hidden border-2 border-vibrant-dark">
                  <motion.div 
                    className="h-full bg-vibrant-yellow"
                    animate={{ width: 0 }}
                    transition={{ duration: gameRef.current.activeSkills[id], ease: "linear" }}
                  />
                </div>
              </div>
            </motion.div>
          );
        })}
      </div>

      {/* Evolution Tree Modal */}
      <AnimatePresence>
        {showTree && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-[#0A0B10]/95 flex items-center justify-center p-6 z-[200] backdrop-blur-md"
          >
            <motion.div 
              initial={{ scale: 0.9, y: 50 }}
              animate={{ scale: 1, y: 0 }}
              className="relative w-full max-w-5xl h-[85vh] text-white flex flex-col"
            >
              {/* Header */}
              <div className="flex justify-between items-start mb-4 z-10 p-6">
                <div>
                  <h2 className="text-4xl sm:text-6xl font-black italic tracking-tighter text-white drop-shadow-[0_0_15px_rgba(255,255,255,0.3)]">FERRAMENTAS</h2>
                  <p className="text-vibrant-yellow font-bold uppercase tracking-widest text-sm mt-2">Árvore de Evolução Técnica</p>
                </div>
                <button 
                  onClick={() => setShowTree(false)}
                  className="p-4 bg-white/10 hover:bg-white/20 text-white rounded-full transition-all border border-white/20 shadow-xl"
                >
                  <X className="w-8 h-8" />
                </button>
              </div>

              {/* Radial Tree Area */}
              <div className="relative flex-1 w-full overflow-hidden bg-vibrant-dark/20 rounded-3xl border border-white/5">
                <svg className="absolute inset-0 w-full h-full pointer-events-none z-0">
                  <defs>
                    <filter id="glow-line" x="-20%" y="-20%" width="140%" height="140%">
                      <feGaussianBlur stdDeviation="5" result="blur" />
                      <feComposite in="SourceGraphic" in2="blur" operator="over" />
                    </filter>
                    <linearGradient id="line-grad" x1="0%" y1="0%" x2="100%" y2="100%">
                      <stop offset="0%" stopColor="#10b981" />
                      <stop offset="100%" stopColor="#3b82f6" />
                    </linearGradient>
                  </defs>
                  
                  {/* Connection Lines */}
                  {Object.values(EVOLUTION_TREE).map(node => node.children.map(childId => {
                    const child = EVOLUTION_TREE[childId];
                    if (!child) return null;
                    
                    const start = EVOLUTION_POSITIONS[node.id];
                    const end = EVOLUTION_POSITIONS[childId];
                    if (!start || !end) return null;

                    const isPathUnlocked = currentPath === childId || 
                                          EVOLUTION_TREE[childId].children.some(cid => currentPath === cid) || 
                                          currentPath === node.id ||
                                          (EVOLUTION_TREE[currentPath]?.children?.includes(node.id));

                    return (
                      <motion.path 
                        key={`${node.id}-${childId}`}
                        d={`M ${start.x}% ${start.y}% L ${end.x}% ${end.y}%`}
                        fill="none"
                        stroke={isPathUnlocked ? "url(#line-grad)" : '#374151'}
                        strokeWidth={isPathUnlocked ? "6" : "3"}
                        strokeDasharray={isPathUnlocked ? "none" : "8,8"}
                        filter={isPathUnlocked ? "url(#glow-line)" : "none"}
                        initial={{ pathLength: 0, opacity: 0 }}
                        animate={{ pathLength: 1, opacity: isPathUnlocked ? 1 : 0.3 }}
                        transition={{ duration: 1, ease: "easeInOut" }}
                      />
                    );
                  }))}
                </svg>

                {/* Nodes */}
                <div className="absolute inset-0 z-10 p-12">
                  {Object.values(EVOLUTION_TREE).map(node => {
                    const pos = EVOLUTION_POSITIONS[node.id];
                    if (!pos) return null;

                    const isUnlocked = currentPath === node.id || 
                                     Object.values(EVOLUTION_TREE).some(n => n.children.includes(node.id) && currentPath === n.id) ||
                                     node.id === 'root';
                    const isCurrent = currentPath === node.id;
                    const canEvolve = EVOLUTION_TREE[currentPath]?.children?.includes(node.id);

                    return (
                      <motion.div
                        key={node.id}
                        initial={{ scale: 0, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        style={{ left: `${pos.x}%`, top: `${pos.y}%` }}
                        className="absolute -translate-x-1/2 -translate-y-1/2"
                      >
                        <div className="flex flex-col items-center gap-3">
                          <motion.button
                            whileHover={{ scale: 1.1 }}
                            whileTap={{ scale: 0.9 }}
                            onClick={() => {
                              if (canEvolve || node.id === 'root') {
                                sounds.playUIClick();
                                // Manual branch selection if allowed
                              }
                            }}
                            className={`w-16 h-16 sm:w-24 sm:h-24 rounded-3xl border-[6px] flex items-center justify-center transition-all relative ${
                              isCurrent 
                                ? 'bg-vibrant-green border-white shadow-[0_0_40px_rgba(16,185,129,0.5)]' 
                                : canEvolve
                                  ? 'bg-vibrant-yellow border-white shadow-xl animate-bounce'
                                  : isUnlocked 
                                    ? 'bg-white border-vibrant-dark/20 shadow-lg' 
                                    : 'bg-vibrant-dark/40 border-vibrant-dark/10 opacity-30 grayscale'
                            }`}
                          >
                            <span className="text-3xl sm:text-5xl">{node.icon}</span>
                            
                            {/* Current Level Indicator */}
                            {isCurrent && (
                              <div className="absolute -top-3 -right-3 bg-white text-vibrant-green text-[10px] font-black px-2 py-1 rounded-full shadow-md border-2 border-vibrant-green">
                                ATUAL
                              </div>
                            )}
                          </motion.button>

                          {/* Constant Label */}
                          <div className={`text-center transition-all ${isUnlocked ? 'opacity-100' : 'opacity-40'}`}>
                            <div className="font-black text-[10px] sm:text-xs uppercase tracking-tighter whitespace-nowrap drop-shadow-md">
                              {node.name}
                            </div>
                            {isUnlocked && (
                              <div className="text-[8px] font-bold text-gray-400 uppercase tracking-widest mt-0.5 max-w-[100px] line-clamp-1 italic">
                                {node.weapons.join(', ')}
                              </div>
                            )}
                          </div>
                        </div>
                      </motion.div>
                    );
                  })}
                </div>
              </div>

              {/* Bottom Info */}
              <div className="flex justify-center p-8 z-10">
                 <div className="inline-flex items-center gap-6 px-8 py-4 bg-white/5 border border-white/10 rounded-full backdrop-blur-sm">
                    <div className="flex items-center gap-2">
                      <div className="w-4 h-4 rounded-full bg-vibrant-green" />
                      <span className="text-xs font-black uppercase text-gray-400 tracking-widest">Nível Atual</span>
                    </div>
                    <div className="flex items-center gap-2">
                       <Zap className="w-5 h-5 text-vibrant-yellow fill-current" />
                       <span className="text-xs font-black uppercase text-white tracking-widest">Evolua a cada 3 levels</span>
                    </div>
                 </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Settings Modal */}
      <AnimatePresence>
        {showAdmin && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-vibrant-dark/60 flex items-center justify-center p-6 z-[400]"
          >
            <motion.div 
              initial={{ scale: 0.9 }}
              animate={{ scale: 1 }}
              className="vibrant-card max-w-md w-full"
            >
              <div className="flex justify-between items-center mb-8">
                <div className="flex items-center gap-3">
                  <LayoutGrid className="w-8 h-8 text-vibrant-red" />
                  <h2 className="text-3xl font-black text-vibrant-dark uppercase tracking-tighter">Visibilidade do Menu</h2>
                </div>
                <button onClick={() => setShowAdmin(false)}><X /></button>
              </div>
              
              <p className="text-xs font-bold text-vibrant-dark/40 uppercase tracking-widest mb-6">Controle quais ferramentas os jogadores poderão ver</p>

              <div className="flex bg-vibrant-dark/5 p-1 rounded-2xl mb-6 border-2 border-vibrant-dark/5">
                {[
                  { id: 'UI', label: 'Geral', icon: '🏠' },
                  { id: 'CAT', label: 'Categorias', icon: '📁' },
                  { id: 'WEAPON', label: 'Armas', icon: '⚔️' }
                ].map((tab) => (
                  <button
                    key={tab.id}
                    onClick={() => setAdminTab(tab.id as any)}
                    className={`flex-1 py-2 rounded-xl text-[10px] font-black uppercase tracking-tighter transition-all flex items-center justify-center gap-2 ${adminTab === tab.id ? 'bg-white text-vibrant-dark shadow-sm border-2 border-vibrant-dark/10' : 'text-vibrant-dark/40 hover:text-vibrant-dark'}`}
                  >
                    <span>{tab.icon}</span>
                    {tab.label}
                  </button>
                ))}
              </div>

              <div className="space-y-4 max-h-[60vh] overflow-y-auto pr-2 custom-scrollbar">
                {adminTab === 'UI' && [
                  { id: 'weaponForge', label: 'The Forge (Armas)', icon: '⚔️' },
                  { id: 'weaponPreview', label: 'Preview da Arma', icon: '🔍' },
                  { id: 'nameInput', label: 'Campo de Nome', icon: '✍️' },
                  { id: 'gameModes', label: 'Modos de Jogo', icon: '🎮' },
                  { id: 'leaderboard', label: 'Leaderboard (Arena)', icon: '🏆' },
                  { id: 'minimap', label: 'Minimap (Arena)', icon: '🗺️' },
                  { id: 'ads', label: 'Propagandas (Laterais)', icon: '📺' },
                ].map((item) => (
                  <div key={item.id} className="flex items-center justify-between p-4 bg-vibrant-dark/5 rounded-2xl border-2 border-vibrant-dark/10">
                    <div className="flex items-center gap-4">
                      <span className="text-2xl">{item.icon}</span>
                      <div className="font-black uppercase text-vibrant-dark text-sm">{item.label}</div>
                    </div>
                    <button 
                      onClick={() => saveVisibility({ ...menuVisibility, [item.id]: !menuVisibility[item.id as keyof typeof menuVisibility] })}
                      className={`w-14 h-8 rounded-full transition-all relative ${menuVisibility[item.id as keyof typeof menuVisibility] ? 'bg-vibrant-green' : 'bg-vibrant-dark/20'}`}
                    >
                      <motion.div 
                        animate={{ x: menuVisibility[item.id as keyof typeof menuVisibility] ? 24 : 4 }}
                        className="absolute top-1 w-6 h-6 bg-white rounded-full shadow-md"
                      />
                    </button>
                  </div>
                ))}

                {adminTab === 'CAT' && Array.from(new Set(WEAPON_PRESETS.map(w => w.category))).map((cat) => (
                  <div key={cat} className="flex items-center justify-between p-4 bg-vibrant-dark/5 rounded-2xl border-2 border-vibrant-dark/10">
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 bg-vibrant-dark/10 rounded-xl flex items-center justify-center text-xl font-black">#</div>
                      <div className="font-black uppercase text-vibrant-dark text-sm">{cat}</div>
                    </div>
                    <button 
                      onClick={() => {
                        const hidden = menuVisibility.hiddenCategories || [];
                        const newHidden = hidden.includes(cat) 
                          ? hidden.filter(c => c !== cat) 
                          : [...hidden, cat];
                        saveVisibility({ ...menuVisibility, hiddenCategories: newHidden });
                      }}
                      className={`w-14 h-8 rounded-full transition-all relative ${!menuVisibility.hiddenCategories?.includes(cat) ? 'bg-vibrant-green' : 'bg-vibrant-dark/20'}`}
                    >
                      <motion.div 
                        animate={{ x: !menuVisibility.hiddenCategories?.includes(cat) ? 24 : 4 }}
                        className="absolute top-1 w-6 h-6 bg-white rounded-full shadow-md"
                      />
                    </button>
                  </div>
                ))}

                {adminTab === 'WEAPON' && WEAPON_PRESETS.map((weapon) => (
                  <div key={weapon.id} className="flex items-center justify-between p-4 bg-vibrant-dark/5 rounded-2xl border-2 border-vibrant-dark/10">
                    <div className="flex items-center gap-4">
                      <span className="text-2xl">{weapon.icon}</span>
                      <div className="flex flex-col">
                        <div className="font-black uppercase text-vibrant-dark text-xs leading-none mb-1">{weapon.name}</div>
                        <div className="text-[9px] font-bold text-vibrant-dark/30 uppercase">{weapon.category}</div>
                      </div>
                    </div>
                    <button 
                      onClick={() => {
                        const hidden = menuVisibility.hiddenWeapons || [];
                        const newHidden = hidden.includes(weapon.id) 
                          ? hidden.filter(w => w !== weapon.id) 
                          : [...hidden, weapon.id];
                        saveVisibility({ ...menuVisibility, hiddenWeapons: newHidden });
                      }}
                      className={`w-14 h-8 rounded-full transition-all relative ${!menuVisibility.hiddenWeapons?.includes(weapon.id) ? 'bg-vibrant-green' : 'bg-vibrant-dark/20'}`}
                    >
                      <motion.div 
                        animate={{ x: !menuVisibility.hiddenWeapons?.includes(weapon.id) ? 24 : 4 }}
                        className="absolute top-1 w-6 h-6 bg-white rounded-full shadow-md"
                      />
                    </button>
                  </div>
                ))}
              </div>

              <button 
                onClick={() => setShowAdmin(false)}
                className="vibrant-button-primary w-full mt-8"
              >
                APLICAR ALTERAÇÕES
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Settings Modal */}
      <AnimatePresence>
        {showSettings && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-vibrant-dark/60 flex items-center justify-center p-6 z-[300]"
          >
            <motion.div 
              initial={{ scale: 0.9 }}
              animate={{ scale: 1 }}
              className="vibrant-card max-w-sm w-full"
            >
              <div className="flex justify-between items-center mb-8">
                <h2 className="text-3xl font-black text-vibrant-dark uppercase">Configurações</h2>
                <button onClick={() => setShowSettings(false)}><X /></button>
              </div>
              
              <div className="space-y-6">
                <div className="flex items-center justify-between p-4 bg-vibrant-dark/5 rounded-2xl border-2 border-vibrant-dark/10">
                  <div>
                    <div className="font-black uppercase text-vibrant-dark">Sistema de Skills</div>
                    <div className="text-xs font-bold text-vibrant-dark/40">Habilita cartas a cada 3 levels</div>
                  </div>
                  <button 
                    onClick={() => setSkillsEnabled(!skillsEnabled)}
                    className={`w-14 h-8 rounded-full transition-all relative ${skillsEnabled ? 'bg-vibrant-green' : 'bg-vibrant-dark/20'}`}
                  >
                    <motion.div 
                      animate={{ x: skillsEnabled ? 24 : 4 }}
                      className="absolute top-1 w-6 h-6 bg-white rounded-full shadow-md"
                    />
                  </button>
                </div>

                <div className="flex items-center justify-between p-4 bg-vibrant-dark/5 rounded-2xl border-2 border-vibrant-dark/10">
                  <div>
                    <div className="font-black uppercase text-vibrant-dark">Bots (IA)</div>
                    <div className="text-xs font-bold text-vibrant-dark/40">Ativar adversários robôs</div>
                  </div>
                  <button 
                    onClick={() => setBotsEnabled(!botsEnabled)}
                    className={`w-14 h-8 rounded-full transition-all relative ${botsEnabled ? 'bg-vibrant-green' : 'bg-vibrant-dark/20'}`}
                  >
                    <motion.div 
                      animate={{ x: botsEnabled ? 24 : 4 }}
                      className="absolute top-1 w-6 h-6 bg-white rounded-full shadow-md"
                    />
                  </button>
                </div>
              </div>

              <button 
                onClick={() => setShowSettings(false)}
                className="vibrant-button-primary w-full mt-8"
              >
                SALVAR
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Skill Choice Modal (DELETED) */}
      <AnimatePresence>
        {false && (
          <div />
        )}
      </AnimatePresence>

      {/* Evolution Choice Modal (DELETED) */}
      <AnimatePresence>
        {false && (
          <div />
        )}
      </AnimatePresence>

      {/* Start Screen */}
      <AnimatePresence>
        {gameState === 'START' && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-transparent flex items-stretch p-4 sm:p-8 md:p-12 z-50 overflow-hidden"
          >
            {/* Left Ad Sidebar */}
            {menuVisibility.ads && (
              <div className="hidden xl:flex w-32 h-full bg-vibrant-yellow-dark/20 border-4 border-vibrant-dark/20 mr-8 rounded-3xl overflow-hidden flex-col shadow-[8px_8px_0_rgba(0,0,0,0.05)]">
                 <div className="bg-vibrant-dark text-white text-[10px] font-black text-center py-1 uppercase tracking-widest">ADVERTISEMENT</div>
                 <div className="flex-1 flex flex-col p-2 gap-4">
                   <div className="bg-white rounded-xl aspect-[9/16] border-2 border-vibrant-dark/10 overflow-hidden relative group cursor-pointer group">
                      <img src="https://picsum.photos/seed/game/200/400" alt="Fake Ad" className="w-full h-full object-cover group-hover:scale-110 transition-transform" referrerPolicy="no-referrer" />
                      <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
                      <div className="absolute bottom-2 left-2 right-2">
                         <div className="text-[10px] font-black text-white uppercase leading-none mb-1">Super Ninja Blade</div>
                         <div className="bg-vibrant-green text-center py-1 rounded text-[8px] font-black text-white uppercase">INSTALL FREE</div>
                      </div>
                   </div>
                   <div className="bg-vibrant-dark/5 rounded-xl flex-1 flex items-center justify-center">
                      <div className="[writing-mode:vertical-lr] font-black text-vibrant-dark/10 uppercase tracking-[0.5em] text-xl rotate-180">PLAY NOW</div>
                   </div>
                 </div>
              </div>
            )}

            <div className="flex flex-col lg:flex-row w-full max-w-7xl mx-auto gap-6 sm:gap-8 items-stretch h-full py-4 sm:py-0 overflow-y-auto lg:overflow-visible">
              {/* Left Side: Game Menu */}
              <motion.div 
                initial={{ x: -100, opacity: 0 }}
                animate={{ x: 0, opacity: 1 }}
                className="vibrant-card w-full lg:w-[400px] xl:w-[480px] flex flex-col justify-between shrink-0 shadow-[12px_12px_0_rgba(0,0,0,0.1)] relative p-8 sm:p-10"
              >
                {/* Logo & Info */}
                <div className="mb-6 flex items-center gap-6">
                  <div className="w-20 h-20 bg-vibrant-yellow rounded-3xl flex items-center justify-center shrink-0 rotate-12 border-4 border-vibrant-dark shadow-[8px_8px_0_rgba(0,0,0,0.1)]">
                    <Sword className="w-10 h-10 text-vibrant-red -rotate-45" />
                  </div>
                  <div className="text-left flex-1">
                    <h1 className="text-4xl sm:text-5xl font-black text-vibrant-dark leading-none tracking-tighter uppercase mb-2">FRUTAS<br/>VS FACA</h1>
                    <p className="text-vibrant-dark/40 text-[9px] sm:text-[10px] font-black uppercase tracking-[0.2em] leading-tight">Gire, corte e crave com estilo!</p>
                  </div>
                  <button 
                    onClick={() => setShowAdmin(true)}
                    className="p-3 bg-vibrant-dark/5 hover:bg-vibrant-dark/10 rounded-2xl transition-colors text-vibrant-dark/20 hover:text-vibrant-dark/60"
                    title="Menu Designer"
                  >
                    <LayoutGrid className="w-6 h-6" />
                  </button>
                </div>

                {/* Weapon Preview Area (RE-DESIGNED) */}
                {menuVisibility.weaponPreview && (
                  <div className="w-full h-full min-h-[220px] mb-6 p-6 bg-vibrant-dark/5 rounded-[3rem] border-4 border-vibrant-dark/10 flex flex-col items-center justify-between relative overflow-hidden group">
                    <div className="absolute inset-0 bg-radial-gradient from-vibrant-yellow/20 to-transparent pointer-events-none" />
                    <div className="flex justify-between w-full items-start relative z-10">
                      <div className="bg-white/80 backdrop-blur-sm px-3 py-1 rounded-full border-2 border-vibrant-dark/10 text-[9px] font-black uppercase text-vibrant-dark/60 tracking-wider">Gear Selection</div>
                      <div className="bg-vibrant-red text-white px-3 py-1 rounded-full border-2 border-vibrant-dark/20 text-[9px] font-black uppercase tracking-wider">Lvl {gameRef.current.battlePlayers.find(p => p.id === 'player')?.level || 1}</div>
                    </div>

                    <motion.div 
                      key={selectedWeapon.id}
                      initial={{ scale: 0.5, rotate: -45, y: 50, opacity: 0 }}
                      animate={{ scale: 1.2, rotate: 0, y: 0, opacity: 1 }}
                      transition={{ type: 'spring', damping: 12 }}
                      className="w-40 h-40 flex items-center justify-center drop-shadow-[0_20px_20px_rgba(0,0,0,0.3)] my-4 relative z-10"
                    >
                      {selectedWeapon.spriteUrl ? (
                        <img src={selectedWeapon.spriteUrl} alt={selectedWeapon.name} className="w-full h-full object-contain -rotate-12" referrerPolicy="no-referrer" />
                      ) : (
                        <span className="text-8xl sm:text-9xl">{selectedWeapon.icon}</span>
                      )}
                    </motion.div>

                    <div className="w-full text-center relative z-10">
                      <div className="inline-block bg-vibrant-dark text-white px-4 py-1.5 rounded-2xl font-black text-sm uppercase tracking-tighter shadow-lg">{selectedWeapon.name}</div>
                    </div>
                  </div>
                )}

                {/* Name Input Area */}
                {menuVisibility.nameInput && (
                  <div className="w-full mb-6 p-4 sm:p-6 bg-vibrant-dark/5 rounded-[1.5rem] sm:rounded-[2rem] border-4 border-vibrant-dark/10 flex flex-col items-center">
                    <label className="text-[9px] font-black uppercase text-vibrant-dark/40 mb-1 tracking-[0.2em]">Nome do Jogador</label>
                    <input 
                      type="text" 
                      value={userName}
                      onChange={(e) => setUserName(e.target.value)}
                      className="w-full bg-transparent border-none text-center text-xl sm:text-2xl font-black text-vibrant-dark focus:outline-none uppercase tracking-tighter"
                      maxLength={15}
                      placeholder="PLAYER"
                    />
                  </div>
                )}

                {/* Main Buttons */}
                {menuVisibility.gameModes && (
                  <div className="flex flex-col gap-2 sm:gap-3 w-full">
                    <button 
                      onClick={(e) => { e.stopPropagation(); sounds.playUIClick(); startGame(); }}
                      className="vibrant-button-primary w-full group relative py-3 sm:py-4 overflow-hidden"
                    >
                      <div className="flex items-center justify-center gap-2 sm:gap-3 text-lg sm:text-2xl">
                        <Play className="w-5 h-5 sm:w-7 sm:h-7 fill-current" />
                        START FLIPPING
                      </div>
                    </button>

                    <div className="grid grid-cols-2 gap-3">
                      <button 
                        onClick={(e) => { e.stopPropagation(); sounds.playUIClick(); startBattle(); }}
                        className="vibrant-button-primary !bg-vibrant-red !shadow-[#EE6055] py-3"
                      >
                        <div className="flex items-center justify-center gap-2 text-xs sm:text-sm font-black">
                          <Sword className="w-4 h-4" />
                          BATTLE ARENA
                        </div>
                      </button>

                      <button 
                        onClick={(e) => { e.stopPropagation(); sounds.playUIClick(); startFreeArena(); }}
                        className="vibrant-button-primary !bg-vibrant-blue !shadow-[0_6px_0_#2563eb] py-3"
                      >
                        <div className="flex items-center justify-center gap-2 text-xs sm:text-sm font-black">
                          <Zap className="w-4 h-4" />
                          FREE ARENA
                        </div>
                      </button>
                    </div>
                  </div>
                )}
              </motion.div>

              {/* Right Side: Weapon Selection (The Forge) */}
              {menuVisibility.weaponForge && (
                <motion.div 
                  initial={{ x: 100, opacity: 0 }}
                  animate={{ x: 0, opacity: 1 }}
                  transition={{ delay: 0.1 }}
                  className="vibrant-card flex-1 min-w-0 flex flex-col shadow-[12px_12px_0_rgba(0,0,0,0.1)] p-8 sm:p-10"
                >
                  <div className="shrink-0 mb-8">
                    <div className="flex justify-between items-center mb-6">
                      <div>
                        <h2 className="text-2xl sm:text-4xl font-black text-vibrant-dark uppercase tracking-tighter">The Forge</h2>
                        <p className="text-[10px] font-black text-vibrant-dark/30 uppercase tracking-widest">Personalize seu equipamento</p>
                      </div>
                      
                      <div className="flex gap-2">
                        <div className="bg-vibrant-yellow px-4 py-2 rounded-2xl border-4 border-vibrant-dark text-[10px] sm:text-xs font-black uppercase tracking-widest text-vibrant-dark shadow-[4px_4px_0_rgba(0,0,0,0.1)] flex items-center gap-2">
                          <div className="w-2 h-2 bg-vibrant-green rounded-full animate-pulse" />
                          SELECT WEAPON
                        </div>
                      </div>
                    </div>

                    {/* Horizontal Categories Row (Requested) */}
                    <div className="flex gap-2 overflow-x-auto pb-4 custom-scrollbar border-b-4 border-vibrant-dark/10 snap-x scroll-smooth">
                      {Array.from(new Set(WEAPON_PRESETS.map(w => w.category)))
                      .filter(cat => !menuVisibility.hiddenCategories?.includes(cat))
                      .map((cat, idx) => (
                        <button
                          key={cat}
                          onClick={() => setActiveCategory(cat)}
                          className={`px-6 py-3 rounded-2xl font-black uppercase text-xs sm:text-sm tracking-tighter transition-all whitespace-nowrap snap-start border-4 ${
                            activeCategory === cat 
                              ? 'bg-vibrant-red text-white border-vibrant-dark shadow-[0_6px_0_#EE6055]' 
                              : 'bg-vibrant-dark/5 text-vibrant-dark/40 border-vibrant-dark/5 hover:bg-vibrant-dark/10'
                          }`}
                        >
                          <span className="text-[10px] opacity-40 mr-1">0{idx+1}</span> {cat}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="flex flex-col lg:flex-row gap-8 min-h-0 overflow-hidden flex-1 mb-4">
                    {/* Weapon Selection (Reverted to Vertical List) */}
                    <div className="flex flex-col gap-4 w-full lg:w-1/2 min-h-0 lg:border-r-4 border-vibrant-dark/5 lg:pr-6">
                      <label className="text-[10px] font-black text-vibrant-dark/40 uppercase tracking-[0.2em] px-2 shrink-0">Disponíveis nesta categoria</label>
                      <div className="flex flex-row lg:flex-col gap-3 overflow-x-auto lg:overflow-y-auto pb-4 lg:pb-0 pr-2 custom-scrollbar snap-y min-h-[140px] lg:min-h-0">
                        {WEAPON_PRESETS
                          .filter(w => w.category === activeCategory)
                          .filter(w => !menuVisibility.hiddenWeapons?.includes(w.id))
                          .map((weapon) => (
                          <button
                            key={weapon.id}
                            onClick={() => setSelectedWeapon(weapon)}
                            className={`min-w-[240px] lg:min-w-0 flex-shrink-0 p-4 rounded-2xl border-4 transition-all flex items-center gap-5 snap-start relative group ${
                              selectedWeapon.id === weapon.id 
                                ? 'border-vibrant-red bg-red-50/80 shadow-[6px_6px_0_#FEE2E2]' 
                                : 'border-slate-200 bg-white hover:border-slate-300'
                            }`}
                          >
                            <div className="w-16 h-16 lg:w-20 lg:h-20 shrink-0 flex items-center justify-center group-hover:scale-110 transition-transform drop-shadow-md">
                              {weapon.spriteUrl ? (
                                <img src={weapon.spriteUrl} alt={weapon.name} className="w-full h-full object-contain -rotate-12" referrerPolicy="no-referrer" />
                              ) : (
                                <span className="text-4xl lg:text-5xl">{weapon.icon}</span>
                              )}
                            </div>
                            <div className="text-left min-w-0">
                              <div className="text-sm lg:text-lg font-black text-vibrant-dark uppercase tracking-tight leading-tight">{weapon.name}</div>
                              <div className="text-vibrant-dark/50 font-bold text-[10px] lg:text-[11px] tracking-tight">{weapon.mass}kg • {Math.round(weapon.sharpnessFactor * 100)}% AFIADO</div>
                            </div>
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Weapon Stats Panel (Redesigned as per image) */}
                    <div className="flex flex-col gap-4 w-full lg:w-1/2 min-h-0 overflow-y-auto no-scrollbar">
                      <div className="bg-[#FAF9F6] p-4 sm:p-6 rounded-[3rem] border-4 border-slate-100 flex flex-col gap-6 items-center shadow-inner h-full overflow-hidden">
                        <div className="w-full space-y-4">
                          <div className="text-center mb-2">
                             <div className="text-sm font-black text-vibrant-dark/40 uppercase tracking-widest opacity-60">Atributos Detalhados</div>
                             <div className="text-3xl sm:text-4xl font-black text-vibrant-dark uppercase tracking-tighter leading-none mb-1">{selectedWeapon.name}</div>
                             <div className="text-vibrant-red font-black text-lg uppercase tracking-tight">Equipamento Profissional</div>
                          </div>

                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3 overflow-y-auto pr-2 custom-scrollbar max-h-[450px]">
                             <StatBar label="Damage" value={(selectedWeapon.damageValue || 20) / 100} color="bg-vibrant-red" />
                             <StatBar label="Crit" value={selectedWeapon.critChance || 0.05} color="bg-amber-500" />
                             <StatBar label="Assertiveness" value={selectedWeapon.stickProbability} color="bg-emerald-500" />
                             <StatBar label="HP" value={selectedWeapon.hiltDurability / 500} color="bg-rose-600" /> 
                             <StatBar label="Energy" value={(selectedWeapon.maxEnergy || 100) / 200} color="bg-cyan-500" />
                             <StatBar label="Knockback" value={selectedWeapon.knockbackForce || 0.3} color="bg-indigo-600" />
                             <StatBar label="Sharpness" value={selectedWeapon.sharpnessFactor} color="bg-vibrant-red" />
                             <StatBar label="Blade Edge" value={selectedWeapon.edgeLength / 2.5} color="bg-vibrant-green" />
                             <StatBar label="Heavy Mass" value={selectedWeapon.mass / 10} color="bg-[#1e293b]" />
                             <StatBar label="Aero Drag" value={1 - selectedWeapon.aerodynamics * 4} color="bg-vibrant-blue" />
                             <StatBar label="Wall Stick" value={selectedWeapon.wallStickForce} color="bg-[#EE6055]" />
                             <StatBar label="Swing Speed" value={(selectedWeapon.swingSpeedMult || 1) / 2} color="bg-[#a855f7]" />
                             <StatBar label="Agility" value={selectedWeapon.agility || 0.3} color="bg-[#ff5a5f]" />
                          </div>
                          
                          <div className="pt-2 border-t-2 border-slate-100 text-[11px] font-bold text-vibrant-dark/40 uppercase tracking-wider text-center italic">
                            "{selectedWeapon.description}"
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </motion.div>
              )}
            </div>

            {/* Right Ad Sidebar */}
            <div className="hidden xl:flex w-32 h-full bg-vibrant-yellow-dark/20 border-4 border-vibrant-dark/20 ml-8 rounded-3xl overflow-hidden flex-col shadow-[8px_8px_0_rgba(0,0,0,0.05)]">
               <div className="bg-vibrant-dark text-white text-[10px] font-black text-center py-1 uppercase tracking-widest">ADVERTISEMENT</div>
               <div className="flex-1 flex flex-col p-2 gap-4">
                 <div className="flex-1 bg-vibrant-dark/5 rounded-xl flex items-center justify-center">
                    <div className="[writing-mode:vertical-lr] font-black text-vibrant-dark/10 uppercase tracking-[0.5em] text-xl">NEW WEAPONS</div>
                 </div>
                 <div className="bg-white rounded-xl aspect-[9/16] border-2 border-vibrant-dark/10 overflow-hidden relative group cursor-pointer">
                    <img src="https://picsum.photos/seed/forge/200/400" alt="Fake Ad" className="w-full h-full object-cover group-hover:scale-110 transition-transform" referrerPolicy="no-referrer" />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
                    <div className="absolute bottom-2 left-2 right-2">
                       <div className="text-[10px] font-black text-white uppercase leading-none mb-1">Mighty Hammer</div>
                       <div className="bg-vibrant-blue text-center py-1 rounded text-[8px] font-black text-white uppercase tracking-tighter">GET IT NOW</div>
                    </div>
                 </div>
               </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Battle HUD */}
      {(gameState === 'BATTLE' || gameState === 'FREE_ARENA') && (
        <div className="absolute top-6 sm:top-8 left-0 w-full px-4 sm:px-8 pointer-events-none flex flex-col gap-4">
          <div className="flex justify-center">
            <div className="bg-transparent text-vibrant-dark px-4 sm:px-6 py-1 sm:py-2 rounded-full font-black text-xl sm:text-3xl border-2 sm:border-4 border-vibrant-dark shadow-[4px_4px_0_rgba(0,0,0,0.1)] sm:shadow-[6px_6px_0_rgba(0,0,0,0.1)]">
              {formatTime(gameRef.current.battleTimer)}
            </div>
          </div>
          {/* Item Notification Toast */}
          <AnimatePresence>
            {itemNotif && (
              <motion.div 
                initial={{ opacity: 0, scale: 0.8, x: 20 }}
                animate={{ opacity: 1, scale: 1, x: 0 }}
                exit={{ opacity: 0, scale: 0.8, x: 20 }}
                className="absolute top-20 right-4 sm:right-8 bg-white/90 backdrop-blur-md rounded-2xl p-4 z-50 border-4 shadow-xl flex items-center gap-4"
                style={{ borderColor: itemNotif.color }}
              >
                <div 
                  className="w-12 h-12 rounded-full flex items-center justify-center text-2xl shadow-inner brightness-110" 
                  style={{ backgroundColor: itemNotif.color, boxShadow: 'inset 0 4px 6px rgba(255,255,255,0.4), inset 0 -4px 6px rgba(0,0,0,0.1)' }}
                >
                  {itemNotif.icon}
                </div>
                <div className="flex flex-col">
                  <span className="font-bold text-xs opacity-60 uppercase tracking-wider" style={{ color: itemNotif.color }}>
                    {itemNotif.title}
                  </span>
                  <span className="font-black text-vibrant-dark text-lg">
                    {itemNotif.name}
                  </span>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {menuVisibility.leaderboard && (
            <div className="absolute top-28 sm:top-32 right-4 sm:right-8 w-64 sm:w-80 bg-vibrant-dark/5 backdrop-blur-md rounded-[1.5rem] sm:rounded-[2rem] p-4 sm:p-6 z-40 border-2 sm:border-4 border-vibrant-dark/20 flex flex-col gap-2 sm:gap-3 shadow-[4px_4px_0_rgba(0,0,0,0.1)] sm:shadow-[8px_8px_0_rgba(0,0,0,0.1)] max-h-[60vh] overflow-y-auto no-scrollbar pointer-events-auto">
              <h3 className="font-black uppercase tracking-tighter text-vibrant-dark text-base sm:text-lg border-b-2 border-vibrant-dark/20 pb-1 sm:pb-2 flex justify-between items-center">
                 Leaderboard
                 <Trophy className="w-4 h-4 sm:w-5 sm:h-5 text-vibrant-yellow" />
              </h3>
              <div className="space-y-2 sm:space-y-3">
                {gameRef.current.battlePlayers.sort((a, b) => b.score - a.score).map((p, i) => (
                  <div key={p.id} className={`flex flex-col gap-0.5 sm:gap-1 p-1.5 sm:p-2 rounded-lg sm:rounded-xl border-2 transition-all ${p.id === 'player' ? 'bg-vibrant-green/10 border-vibrant-green' : 'bg-transparent border-transparent'}`}>
                    <div className="flex justify-between items-center text-[11px] sm:text-sm font-black uppercase text-vibrant-dark truncate">
                      <div className="flex items-center gap-1 sm:gap-2 truncate">
                         <span className="text-vibrant-dark/30 text-[9px] sm:text-[10px]">#{i+1}</span>
                         <span className={p.id === 'player' ? 'text-vibrant-green' : ''}>{p.name}</span>
                      </div>
                      <span className="tabular-nums text-lg sm:text-2xl ml-2">{Math.floor(p.score)}</span>
                    </div>

                    {/* Mini HP Bar in Leaderboard */}
                    <div className="w-full bg-vibrant-dark/20 h-2 sm:h-2.5 rounded-full overflow-hidden mb-1 border border-vibrant-dark/10">
                      <motion.div 
                        className="h-full bg-vibrant-green"
                        animate={{ 
                          width: `${(Math.max(0, p.hp || 0) / (p.maxHp || 100)) * 100}%`,
                          backgroundColor: (p.hp || 0) < 30 ? '#ef4444' : '#22c55e'
                        }}
                        transition={{ type: 'spring', stiffness: 100, damping: 20 }}
                      />
                    </div>

                    <div className="flex gap-4 sm:gap-6 text-xs sm:text-sm font-black text-vibrant-dark uppercase">
                       <span className="flex items-center gap-1">⚔️ <span className="tabular-nums text-sm sm:text-lg">{p.kills}</span></span>
                       <span className="flex items-center gap-1">🍎 <span className="tabular-nums text-sm sm:text-lg">{p.fruits}</span></span>
                       <span className="text-vibrant-dark/40">LVL {p.level}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Minimap */}
      {(gameState === 'BATTLE' || gameState === 'FREE_ARENA') && menuVisibility.minimap && (
        <div className="absolute bottom-8 right-8 w-40 h-40 bg-vibrant-dark/60 border-4 border-white rounded-3xl overflow-hidden pointer-events-none shadow-2xl">
          <div className="absolute inset-0 opacity-20">
            <div className="w-full h-full" style={{ 
              backgroundImage: 'radial-gradient(circle, #fff 1px, transparent 1px)', 
              backgroundSize: '20px 20px' 
            }} />
          </div>
          {gameRef.current.battlePlayers.map(p => {
            const isFreeArena = gameState === 'FREE_ARENA';
            const arenaW = isFreeArena ? FREE_ARENA_WIDTH : ARENA_WIDTH;
            const arenaH = isFreeArena ? FREE_ARENA_HEIGHT : ARENA_HEIGHT;
            
            const baseBottomLimit = arenaH - window.innerHeight;
            const minimapCameraY = gameRef.current && gameRef.current.arenaCameraY > baseBottomLimit ? gameRef.current.arenaCameraY - baseBottomLimit : 0;
            
            return (
              <motion.div 
                key={p.id}
                className={`absolute w-2 h-2 rounded-full ${p.id === 'player' ? 'bg-vibrant-green shadow-[0_0_10px_#4ade80]' : 'bg-vibrant-red shadow-[0_0_10px_#ef4444]'}`}
                style={{
                  left: `${(p.x / arenaW) * 100}%`,
                  top: `${((p.y - minimapCameraY) / arenaH) * 100}%`,
                  transform: 'translate(-50%, -50%)'
                }}
              />
            );
          })}
        </div>
      )}

      {/* Battle Results Screen */}
      <AnimatePresence>
        {gameState === 'BATTLERESULTS' && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="absolute inset-0 bg-vibrant-dark/80 flex items-center justify-center p-6 z-[100]"
          >
            <motion.div 
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              className="vibrant-card max-w-2xl w-full"
            >
              <div className="text-center mb-8">
                <h2 className="text-5xl font-black text-vibrant-dark uppercase tracking-tighter">Arena Results</h2>
                <div className="text-vibrant-dark/40 font-bold uppercase tracking-widest mt-2">Match Finished</div>
              </div>

              {/* Ad Placeholder */}
              <div className="bg-vibrant-yellow-dark/20 border-4 border-dashed border-vibrant-dark/20 rounded-3xl p-6 mb-8 text-center relative overflow-hidden group">
                <div className="flex items-center justify-center gap-4 relative z-10">
                   <div className="w-16 h-16 bg-white rounded-2xl border-2 border-vibrant-dark/10 shadow-lg p-2">
                      <img src="https://picsum.photos/seed/tool/100/100" alt="App" className="w-full h-full object-contain" referrerPolicy="no-referrer" />
                   </div>
                   <div className="text-left">
                      <div className="text-vibrant-dark/60 font-black text-lg uppercase tracking-tighter">Kitchen Master 3D</div>
                      <div className="text-[10px] font-bold text-vibrant-dark/40 uppercase tracking-widest">Available in Store</div>
                   </div>
                   <button className="bg-vibrant-green text-white px-6 py-2 rounded-xl font-black text-xs uppercase shadow-[0_4px_0_#5A943A] active:translate-y-1 active:shadow-none ml-auto">INSTALL</button>
                </div>
                <div className="absolute top-2 right-2 text-[8px] font-black text-vibrant-dark/20 uppercase tracking-[0.2em]">ADVERTISEMENT</div>
              </div>

              <div className="space-y-4 mb-10">
                {gameRef.current.battlePlayers.sort((a, b) => b.score - a.score).map((p, i) => (
                  <div 
                    key={p.id} 
                    className={`flex items-center justify-between p-4 rounded-2xl border-4 ${
                      i === 0 ? 'bg-vibrant-yellow border-vibrant-dark' : 'bg-white border-vibrant-dark/10'
                    }`}
                  >
                    <div className="flex items-center gap-4">
                      <div className="text-2xl font-black w-8">{i + 1}</div>
                      <div className="text-3xl">{p.weapon.icon}</div>
                      <div>
                        <div className="font-black uppercase tracking-tight text-xl">{p.name}</div>
                        <div className="text-xs font-bold text-vibrant-dark/40">
                          {p.fruits} Fruits • {p.kills} Kills
                        </div>
                      </div>
                    </div>
                    <div className="text-3xl font-black tabular-nums">{p.score}</div>
                  </div>
                ))}
              </div>

              <div className="flex flex-col gap-3">
                <button 
                  onClick={() => setShowAdVideo(true)}
                  className="bg-vibrant-yellow text-vibrant-dark py-4 rounded-2xl font-black text-2xl hover:scale-105 transition-all shadow-[0_0_20px_#fde047] w-full"
                >
                  WATCH AD TO RESUME
                </button>
                <div className="flex gap-4">
                  <button 
                    onClick={startBattle}
                    className="vibrant-button-primary flex-1 text-xl py-3"
                  >
                    NEW MATCH
                  </button>
                  <button 
                    onClick={() => setGameState('START')}
                    className="vibrant-button-secondary flex-1 text-xl py-3"
                  >
                    MENU
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Game Over Screen (Classic Mode) */}
      <AnimatePresence>
        {gameState === 'GAMEOVER' && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-vibrant-dark/60 flex items-center justify-center p-6 z-50"
          >
            <motion.div 
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              className="vibrant-card max-w-md w-full text-center"
            >
              <h2 className="text-3xl font-black text-vibrant-dark mb-2 uppercase tracking-tighter">Game Over</h2>
              <div className="text-8xl font-black text-vibrant-red mb-8 tracking-tighter">{score}</div>
              
              <div className="flex flex-col gap-6">
                <button 
                  onClick={(e) => { e.stopPropagation(); startGame(); }}
                  className="vibrant-button-primary w-full flex items-center justify-center gap-3 text-xl"
                >
                  <RotateCcw className="w-6 h-6" />
                  TRY AGAIN
                </button>
                <button 
                  onClick={(e) => { e.stopPropagation(); setGameState('START'); }}
                  className="text-vibrant-dark/40 font-black text-lg hover:text-vibrant-dark transition-colors uppercase tracking-widest"
                >
                  BACK TO MENU
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* DEFEAT SCREEN */}
      {showDefeat && !showAdVideo && (
        <div className="absolute inset-0 z-[110] bg-vibrant-dark/60 flex flex-col items-center justify-center p-4 backdrop-blur-sm pointer-events-auto">
          <h1 className="text-4xl sm:text-5xl font-black text-vibrant-red uppercase tracking-tighter mb-4 drop-shadow-[0_0_15px_rgba(239,68,68,0.5)] animate-pulse py-3 border-y-4 border-vibrant-red w-full text-center bg-vibrant-dark/40">
            ELIMINATED
          </h1>

          {/* AdMob Banner Placeholder (MREC layout) */}
          <div className="bg-transparent border-2 border-dashed border-white/20 rounded-2xl flex flex-col items-center justify-center p-4 mb-6 w-[300px] h-[250px] relative">
             <span className="text-white/40 font-black tracking-widest text-lg uppercase mb-2">AdMob Banner</span>
             <span className="text-white/30 font-bold text-xs tracking-widest text-center px-4">ca-app-pub-3940256099942544/6300978111</span>
             <span className="absolute bottom-2 right-2 text-[8px] text-white/20 uppercase">Advertisement</span>
          </div>

          <div className="flex flex-col gap-3 w-full max-w-sm">
             <button 
                onClick={(e) => {
                   e.stopPropagation();
                   setShowDefeat(false);
                   setShowAdVideo(true);
                }}
                className="bg-vibrant-yellow text-vibrant-dark py-4 px-8 rounded-2xl font-black text-xl hover:scale-105 active:scale-95 transition-all shadow-[0_0_20px_#fde047] w-full"
             >
                WATCH AD (REVIVE)
             </button>
             <button 
                onClick={(e) => {
                   e.stopPropagation();
                   setShowDefeat(false);
                   (gameRef.current as any).isDefeated = false;
                   setGameState('START');
                }}
                className="bg-white/10 text-white py-3 px-8 rounded-2xl font-bold text-base hover:bg-white/20 hover:scale-105 active:scale-95 transition-all w-full"
             >
                RETURN TO MENU
             </button>
          </div>
        </div>
      )}

      {/* AD VIDEO REWARD SCREEN */}
      {showAdVideo && (
        <div className="absolute inset-0 z-[120] bg-black flex flex-col items-center justify-center pointer-events-auto">
          <div className="absolute inset-0 flex flex-col items-center justify-center" style={{ backgroundImage: "radial-gradient(circle, #2563eb, #000)" }}>
             <h2 className="text-6xl text-white font-black uppercase tracking-widest mb-4 opacity-40 blur-[1px]">REWARDED AD</h2>
             <span className="text-white/40 font-black text-sm tracking-widest uppercase mb-6">ca-app-pub-3940256099942544/5224354917</span>
             <p className="text-white font-bold opacity-60 bg-black/40 px-8 py-4 rounded-full border border-white/10 text-center max-w-lg">Watch this ad to keep your weapon, level and XP and return to the battle.</p>
          </div>

          <div className="absolute top-6 right-6 flex items-center gap-4 z-10 w-full justify-end px-6">
             {adTimer <= 25 ? (
               <button 
                 onClick={(e) => {
                   e.stopPropagation();
                   const player = gameRef.current.battlePlayers.find(p => p.id === 'player');
                   if (player) {
                      player.hp = player.maxHp;
                      player.respawnTimer = 0;
                      (gameRef.current as any).isDefeated = false;
                      if (gameState === 'BATTLERESULTS') {
                         gameRef.current.battleTimer = 60; // Add 60 seconds
                         setGameState('BATTLE');
                      }
                      const isFreeArena = gameState === 'FREE_ARENA';
                      const arenaW = isFreeArena ? FREE_ARENA_WIDTH : ARENA_WIDTH;
                      player.x = arenaW / 2 + (Math.random() * 400 - 200);
                      player.y = -200; // Drop from the sky
                      player.vx = 0;
                      player.vy = 0;
                      
                      // Notify network
                      if (channelRef.current) {
                         channelRef.current.send({
                           type: 'broadcast',
                           event: 'update',
                           payload: { id: 'player', data: { hp: player.maxHp, x: player.x, y: player.y } }
                         });
                      }
                   }
                   setShowAdVideo(false);
                 }}
                 className="bg-vibrant-dark/20 text-white hover:bg-white hover:text-black py-2 px-6 rounded-full font-black text-lg transition-all border-2 border-white backdrop-blur-md shadow-[0_0_20px_#fff] flex items-center justify-center gap-2"
               >
                 SKIP AD »
               </button>
             ) : (
               <div className="bg-black/80 text-white/50 font-black tracking-widest py-3 px-6 rounded-full border border-white/20">
                 WAIT {adTimer - 25}s
               </div>
             )}
          </div>
          
          <div className="absolute bottom-10 left-10 text-white/30 font-black text-2xl">
            {adTimer} SECONDS REMAINING
          </div>
        </div>
      )}


      {/* Battle HUD */}
    </div>
  );
}
