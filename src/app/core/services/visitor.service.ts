import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { catchError, map, Observable, of } from 'rxjs';

interface HostedVisitorResponse {
  totalCount?: number;
  todayCount?: number;
}

@Injectable({ providedIn: 'root' })
export class VisitorService {
  private http = inject(HttpClient);
  private readonly hostedCounterUrl = 'https://visitor.6developer.com/visit';
  private readonly productionDomain = 'popaurastream.app';
  private readonly visitorCookie = 'popaurastream_visitor_seen';
  private readonly localCountKey = 'popaurastream_local_visitor_count';

  getVisitorCount(): Observable<number> {
    return this.http.get<{ visitors: number }>('/api/visitors').pipe(
      map((result) => result?.visitors ?? this.getLocalVisitorCount()),
      catchError(() => this.getHostedVisitorCount()),
    );
  }

  private getHostedVisitorCount(): Observable<number> {
    if (!this.shouldUseHostedCounter()) {
      return of(this.getLocalVisitorCount());
    }

    const body = {
      domain: this.productionDomain,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      page_path: window.location.pathname,
      page_title: document.title,
      referrer: document.referrer,
    };

    return this.http.post<HostedVisitorResponse>(this.hostedCounterUrl, body).pipe(
      map((result) => result.totalCount ?? this.getLocalVisitorCount()),
      catchError(() => of(this.getLocalVisitorCount())),
    );
  }

  private shouldUseHostedCounter(): boolean {
    if (typeof window === 'undefined') {
      return false;
    }

    const hostname = window.location.hostname.toLowerCase();
    return hostname === this.productionDomain || hostname.endsWith('.github.io');
  }

  private getLocalVisitorCount(): number {
    if (typeof window === 'undefined' || typeof window.localStorage === 'undefined') {
      return 0;
    }

    const hasVisited = localStorage.getItem(this.visitorCookie) === 'true';
    let count = Number.parseInt(localStorage.getItem(this.localCountKey) ?? '0', 10);
    count = Number.isFinite(count) ? count : 0;

    if (!hasVisited) {
      count += 1;
      localStorage.setItem(this.localCountKey, count.toString());
      localStorage.setItem(this.visitorCookie, 'true');
    }

    return count;
  }
}
