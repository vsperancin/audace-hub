'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ComponentType } from 'react';
import {
  LayoutDashboard,
  Package,
  ShoppingCart,
  Plug,
  Settings,
  type LucideIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { NavItem } from '@/types';

/**
 * Item de navegação renderizado na sidebar.
 *
 * Estende `NavItem` (que define `icon` como literal de string — útil para
 * serialização) trocando o campo `icon` por uma referência de componente
 * real do lucide-react, que é o que precisamos para renderizar.
 */
type NavItemRender = Omit<NavItem, 'icon'> & { icon: LucideIcon };

/**
 * Sidebar estilo Magiic — itens: Escritório / Estoque / Vendas / Conexões / Configurações.
 *
 * Por enquanto Estoque/Vendas são placeholders estruturados (links para
 * rotas a serem implementadas). Conexões é o único já funcional.
 *
 * O componente é Client porque usa `usePathname()` para highlight ativo.
 */
const NAV_ITEMS: NavItemRender[] = [
  { label: 'Escritório', href: '/dashboard', icon: LayoutDashboard },
  { label: 'Estoque', href: '/dashboard/estoque', icon: Package },
  { label: 'Vendas', href: '/dashboard/vendas', icon: ShoppingCart },
  { label: 'Conexões', href: '/dashboard/connections', icon: Plug },
  { label: 'Configurações', href: '/dashboard/settings', icon: Settings },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="hidden w-60 shrink-0 border-r bg-background md:flex md:flex-col">
      <div className="flex h-16 items-center border-b px-6">
        <Link href="/dashboard" className="text-lg font-bold text-brand-500">
          Audace Hub
        </Link>
      </div>

      <nav className="flex-1 space-y-1 px-3 py-4">
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const isActive =
            item.href === '/dashboard'
              ? pathname === '/dashboard'
              : pathname.startsWith(item.href);

          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
                isActive
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:bg-muted hover:text-foreground',
              )}
            >
              <Icon className="h-4 w-4" />
              {item.label}
              {item.badge !== undefined && item.badge > 0 && (
                <span className="ml-auto rounded-full bg-accent px-2 py-0.5 text-xs text-accent-foreground">
                  {item.badge}
                </span>
              )}
            </Link>
          );
        })}
      </nav>

      <div className="border-t p-4 text-xs text-muted-foreground">
        v0.1.0 · 2026
      </div>
    </aside>
  );
}