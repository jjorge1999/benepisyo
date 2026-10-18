import React, { useState } from 'react';
import Alert from 'antd/es/alert';
import Button from 'antd/es/button';
import Card from 'antd/es/card';
import Flex from 'antd/es/flex';
import Input from 'antd/es/input';
import Space from 'antd/es/space';
import Tag from 'antd/es/tag';
import Typography from 'antd/es/typography';
import BorderOutlined from '@ant-design/icons/es/icons/BorderOutlined';
import CheckCircleFilled from '@ant-design/icons/es/icons/CheckCircleFilled';
import CheckSquareFilled from '@ant-design/icons/es/icons/CheckSquareFilled';
import ClockCircleOutlined from '@ant-design/icons/es/icons/ClockCircleOutlined';
import ExclamationCircleOutlined from '@ant-design/icons/es/icons/ExclamationCircleOutlined';
import InfoCircleOutlined from '@ant-design/icons/es/icons/InfoCircleOutlined';
import { M, peso, send, store, useApp } from './shared.js';

const { Text } = Typography;

export function StatusTag({ b, today }) {
  const { t } = useApp();
  const st = M.effectiveStatus(b, today);
  const map = { confirmed: ['success', <CheckCircleFilled key="i" />], reported: ['warning', <InfoCircleOutlined key="i" />], outdated: ['error', <ExclamationCircleOutlined key="i" />] };
  return <Tag className={'badge ' + st} color={map[st][0]} icon={map[st][1]}>{t('badge_' + st)}</Tag>;
}

export function LevelTag({ b }) {
  const { t, cityName } = useApp();
  return b.level === 'local'
    ? <Tag color="green">{t('tag_local', { city: cityName(b.city) })}</Tag>
    : <Tag color="blue">{t('tag_national')}</Tag>;
}

export function Amount({ b, size = 'md' }) {
  const { t, L } = useApp();
  if (b.amount_php) {
    return (
      <div className={'amount amount-' + size}>
        {peso(b.amount_php)} {b.amount_note && <Text type="secondary" className="amount-note">{L(b.amount_note)}</Text>}
      </div>
    );
  }
  return <div className={'value value-' + size}>{b.value ? L(b.value) : t('detail_amount_unknown')}</div>;
}

export function MaybeLine({ res }) {
  const { t } = useApp();
  if (!res || res.fit !== 'maybe' || !res.unknown.length) return null;
  return <Text type="warning" className="maybe">{t('maybe_note', { what: res.unknown.map((u) => t('maybe_' + u)).join(', ') })}</Text>;
}

export function BenefitCard({ b, res, today }) {
  const { t, L, fmtDate, benefitUrl } = useApp();
  return (
    <Card size="small" hoverable className="card" data-id={b.id} data-groups={b.groups.join(' ')}>
      <Flex vertical gap={4}>
        <a className="title" href={benefitUrl(b)}>{L(b.title)}</a>
        <Amount b={b} />
        <Text type="secondary">{L(b.frequency)}</Text>
        {b.expires_on && <Text type="warning" className="maybe"><ClockCircleOutlined /> {t('ends_on', { date: fmtDate(b.expires_on) })}</Text>}
        {b.no_apply && <Text type="secondary">{t('no_apply')}</Text>}
        <MaybeLine res={res} />
        <Flex gap={6} wrap align="center" className="meta">
          <LevelTag b={b} />
          <StatusTag b={b} today={today} />
          <Text type="secondary" className="small">{t('checked', { date: fmtDate(b.verification.checked_on) })}</Text>
        </Flex>
      </Flex>
    </Card>
  );
}

/* Large tappable option: radio or checkbox look, built on an antd Button. */
export function Choice({ on, multi, children, hint, ...rest }) {
  return (
    <Button
      block
      size="large"
      className="choice"
      type={on ? 'primary' : 'default'}
      ghost={!!on}
      role={multi ? 'checkbox' : 'radio'}
      aria-checked={!!on}
      aria-pressed={!!on}
      icon={multi ? (on ? <CheckSquareFilled /> : <BorderOutlined />) : undefined}
      {...rest}
    >
      <span className="choice-text">{children}{hint && <span className="hint">{hint}</span>}</span>
    </Button>
  );
}

/* "Did you get it?" prompt a day after planning a visit. */
export function pendingCheckin(benefitById, today) {
  const visits = store.get('visits', []);
  return visits.find((v) => !v.answered && M.daysBetween(v.at, today) >= 1 && benefitById(v.id)) || null;
}

export function Checkin({ fullData, today }) {
  const { t, L, cityName, cfg } = useApp();
  const byId = (id) => fullData && fullData.benefits.find((b) => b.id === id);
  const [v] = useState(() => (fullData ? pendingCheckin(byId, today) : null));
  const [step, setStep] = useState('ask');
  const [detail, setDetail] = useState('');
  if (!v) return null;
  const b = byId(v.id);
  const city = v.city || 'calamba';
  const done = (answer, extra) => {
    const visits = store.get('visits', []);
    visits.forEach((x) => { if (x.id === v.id && !x.answered) x.answered = answer; });
    store.set('visits', visits);
    send(cfg.api, '/api/checkins', { benefit_id: v.id, answer, reason: (extra && extra.reason) || null, detail: (extra && extra.detail) || null, city });
    setStep('thanks');
  };
  if (step === 'thanks') return <Alert id="checkin" type="success" showIcon message={t('checkin_thanks', { city: cityName(city) || 'Calamba' })} />;
  return (
    <Alert
      id="checkin"
      type="info"
      showIcon
      message={<b>{t('checkin_q', { title: L(b.title) })}</b>}
      description={
        <Space direction="vertical" style={{ width: '100%' }}>
          <Flex gap={8} wrap>
            <Button type="primary" data-ans="yes" onClick={() => done('yes')}>{t('checkin_yes')}</Button>
            <Button data-ans="no" onClick={() => setStep('no')}>{t('checkin_no')}</Button>
            <Button type="text" data-ans="different" onClick={() => setStep('diff')}>{t('checkin_diff')}</Button>
          </Flex>
          {step === 'no' && (
            <>
              <b>{t('checkin_why')}</b>
              <Flex gap={8} wrap>{['budget', 'ended', 'sched', 'other'].map((r) => <Button key={r} size="small" data-reason={r} onClick={() => done('no', { reason: r })}>{t('checkin_' + r)}</Button>)}</Flex>
            </>
          )}
          {step === 'diff' && (
            <>
              <label htmlFor="checkin-detail">{t('checkin_diff_q')}</label>
              <Input.TextArea id="checkin-detail" maxLength={500} value={detail} onChange={(e) => setDetail(e.target.value)} />
              <Button type="primary" id="checkin-send" onClick={() => done('different', { detail: detail.trim().slice(0, 500) })}>{t('report_send')}</Button>
            </>
          )}
        </Space>
      }
    />
  );
}
