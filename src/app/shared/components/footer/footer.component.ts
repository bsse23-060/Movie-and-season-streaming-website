import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { VisitorService } from '../../../core/services/visitor.service';

@Component({
  selector: 'app-footer',
  templateUrl: './footer.component.html',
  styleUrls: ['./footer.component.css'],
  standalone: true,
  imports: [CommonModule, RouterModule]
})
export class FooterComponent implements OnInit {
  currentYear = new Date().getFullYear();
  visitorCount = 0;
  visitorStatus = 'Loading visitor count...';

  private visitorService = inject(VisitorService);

  ngOnInit(): void {
    this.visitorService.getVisitorCount().subscribe({
      next: (count) => {
        this.visitorCount = count;
        this.visitorStatus = 'Total visitors tracked';
      },
      error: () => {
        this.visitorStatus = 'Unable to load visitor count';
      }
    });
  }
}
