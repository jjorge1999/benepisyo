import { Component, inject, input, signal, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { NzAlertModule } from 'ng-zorro-antd/alert';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzInputModule } from 'ng-zorro-antd/input';
import { AppService, store } from '../core/app.service';

/* "Nakuha mo ba?" — asked a day after someone planned a visit. Browser only. */
@Component({
  selector: 'app-checkin',
  imports: [NzAlertModule, NzButtonModule, NzInputModule, FormsModule],
  template: `
    @if (v(); as v) {
      @if (step() === 'thanks') {
        <nz-alert id="checkin" nzType="success" nzShowIcon [nzMessage]="app.t('checkin_thanks', { city: app.cityName(v.city || 'calamba') || 'Calamba' })" />
      } @else {
        <nz-alert id="checkin" nzType="info" nzShowIcon [nzMessage]="q" [nzDescription]="body" />
        <ng-template #q><b>{{ app.t('checkin_q', { title: app.L(app.benefitById(v.id).title) }) }}</b></ng-template>
        <ng-template #body>
          <div class="col gap8">
            <div class="row wrap gap8">
              <button nz-button nzType="primary" data-ans="yes" (click)="done('yes')"><span>{{ app.t('checkin_yes') }}</span></button>
              <button nz-button data-ans="no" (click)="step.set('no')"><span>{{ app.t('checkin_no') }}</span></button>
              <button nz-button nzType="text" data-ans="different" (click)="step.set('diff')"><span>{{ app.t('checkin_diff') }}</span></button>
            </div>
            @if (step() === 'no') {
              <b>{{ app.t('checkin_why') }}</b>
              <div class="row wrap gap8">
                @for (r of reasons; track r) { <button nz-button nzSize="small" [attr.data-reason]="r" (click)="done('no', { reason: r })"><span>{{ app.t('checkin_' + r) }}</span></button> }
              </div>
            }
            @if (step() === 'diff') {
              <label for="checkin-detail">{{ app.t('checkin_diff_q') }}</label>
              <textarea nz-input id="checkin-detail" maxlength="500" [(ngModel)]="detail"></textarea>
              <button nz-button nzType="primary" id="checkin-send" (click)="done('different', { detail: detail.trim().slice(0, 500) })"><span>{{ app.t('report_send') }}</span></button>
            }
          </div>
        </ng-template>
      }
    }`
})
export class Checkin implements OnInit {
  app = inject(AppService);
  today = input.required<string>();
  v = signal<any>(null);
  step = signal<'ask' | 'no' | 'diff' | 'thanks'>('ask');
  detail = '';
  reasons = ['budget', 'ended', 'sched', 'other'];

  ngOnInit() { if (this.app.browser) this.v.set(this.app.pendingCheckin(this.today())); }

  done(answer: string, extra?: { reason?: string; detail?: string }) {
    const v = this.v();
    const visits = store.get<any[]>('visits', []);
    visits.forEach((x) => { if (x.id === v.id && !x.answered) x.answered = answer; });
    store.set('visits', visits);
    this.app.send('/api/checkins', { benefit_id: v.id, answer, reason: extra?.reason || null, detail: extra?.detail || null, city: v.city || 'calamba' });
    this.step.set('thanks');
  }
}
