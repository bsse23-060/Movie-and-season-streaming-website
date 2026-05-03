import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { catchError, map, Observable, of } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class VisitorService {
  private http = inject(HttpClient);
  private readonly visitorCookie = 'popaurastream_visitor_seen';
  private readonly localCountKey = 'popaurastream_local_visitor_count';

  getVisitorCount(): Observable<number> {
    return this.http.get<{ visitors: number }>('/api/visitors').pipe(
      map((result) => result?.visitors ?? this.getLocalVisitorCount()),
      catchError(() => of(this.getLocalVisitorCount())),
    );
  }

  private getLocalVisitorCount(): number {
    if (typeof window === 'undefined' || typeof window.localStorage === 'undefined') {
      return 0;
    }

    const hasVisited = localStorage.getItem(this.visitorCookie) === 'true';
    let count = parseInt(localStorage.getItem(this.localCountKey) ?? '0', 10);

    if (!hasVisited) {
      count += 1;
      localStorage.setItem(this.localCountKey, count.toString());
      localStorage.setItem(this.visitorCookie, 'true');
    }

    return count;
  }
}
