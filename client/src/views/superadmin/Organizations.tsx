// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) RIT Services and contributors

import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAppDispatch, useAppSelector } from '@/store';
import { fetchOrgsThunk } from '@/store/superadminSlice';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { EmptyState } from '@/components/EmptyState';

export function Organizations() {
  const dispatch = useAppDispatch();
  const { orgs, loading, error } = useAppSelector((s) => s.superadmin);

  useEffect(() => {
    void dispatch(fetchOrgsThunk());
  }, [dispatch]);

  return (
    <div className="space-y-4">
      {/* Single-organization edition (D6): no "create organization" action — the
          one org is bootstrapped on first run and the server refuses a second. */}
      <div>
        <h1 className="text-2xl font-semibold">Organization</h1>
        <p className="text-sm text-muted-foreground">
          Manage seat limits, features, and status.
        </p>
      </div>

      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      {loading && orgs.length === 0 ? (
        <p className="text-sm text-muted-foreground">Loading organizations…</p>
      ) : orgs.length === 0 ? (
        <EmptyState
          title="No organization yet"
          description="The organization is created on first run from ADMIN_EMAIL / ADMIN_PASSWORD — check the server bootstrap logs."
        />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Slug</TableHead>
              <TableHead>Seats</TableHead>
              <TableHead>Projects</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {orgs.map((o) => {
              const full = o.seatsUsed >= o.maxUsers;
              return (
                <TableRow key={o.id}>
                  <TableCell className="font-medium">
                    <Link
                      to={`/superadmin/orgs/${o.id}`}
                      className="hover:underline"
                      aria-label={`Manage ${o.name}`}
                    >
                      {o.name}
                    </Link>
                  </TableCell>
                  <TableCell className="font-mono text-xs text-muted-foreground">{o.slug}</TableCell>
                  <TableCell>
                    <span className={full ? 'font-medium text-destructive' : undefined}>
                      {o.seatsUsed}/{o.maxUsers}
                    </span>
                  </TableCell>
                  <TableCell>{o.projectCount}</TableCell>
                  <TableCell>
                    <Badge variant={o.status === 'suspended' ? 'destructive' : 'outline'}>
                      {o.status}
                    </Badge>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
