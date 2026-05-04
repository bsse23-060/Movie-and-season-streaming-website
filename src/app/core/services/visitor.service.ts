import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { catchError, map, Observable, of } from 'rxjs';

interface HostedVisitorResponse {
  totalCount?: number;
  todayCount?: number;
}

interface CounterApiResponse {
  count?: number;
}

@Injectable({ providedIn: 'root' })
export class VisitorService {
  private http = inject(HttpClient);
  private readonly globalCounterUrl = 'https://api.counterapi.dev/v1/popaurastream/website-visits/up';
  private readonly productionDomain = 'popaurastream.app';
  private readonly legacyHostedCounterUrl = 'https://visitor.6developer.com/visit';
  private readonly localCountKey = 'popaurastream_local_visit_count';

  getVisitorCount(): Observable<number> {
    if (this.shouldUseGlobalCounter()) {
      return this.getGlobalVisitorCount();
    }

    return this.http.get<{ visitors: number }>('/api/visitors').pipe(
      map((result) => result?.visitors ?? this.getLocalVisitorCount()),
      catchError(() => of(this.getLocalVisitorCount())),
    );
  }

  private getGlobalVisitorCount(): Observable<number> {
    return this.http.get<CounterApiResponse>(this.globalCounterUrl).pipe(
      map((result) => result.count ?? this.getLocalVisitorCount()),
      catchError(() => this.getLegacyHostedVisitorCount()),
    );
  }

  private getLegacyHostedVisitorCount(): Observable<number> {
    const body = {
      domain: this.productionDomain,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      page_path: window.location.pathname,
      page_title: document.title,
      referrer: document.referrer,
    };

    return this.http.post<HostedVisitorResponse>(this.legacyHostedCounterUrl, body).pipe(
      map((result) => result.totalCount ?? this.getLocalVisitorCount()),
      catchError(() => of(this.getLocalVisitorCount())),
    );
  }

  private shouldUseGlobalCounter(): boolean {
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

    let count = Number.parseInt(localStorage.getItem(this.localCountKey) ?? '0', 10);
    count = Number.isFinite(count) ? count : 0;
    count += 1;

    localStorage.setItem(this.localCountKey, count.toString());

    return count;
  }
}
