import React, { useEffect, useMemo, useState } from 'react';
import Alert from 'antd/es/alert';
import Button from 'antd/es/button';
import Card from 'antd/es/card';
import Checkbox from 'antd/es/checkbox';
import Flex from 'antd/es/flex';
import Form from 'antd/es/form';
import Input from 'antd/es/input';
import List from 'antd/es/list';
import Modal from 'antd/es/modal';
import Space from 'antd/es/space';
import Steps from 'antd/es/steps';
import Tag from 'antd/es/tag';
import Timeline from 'antd/es/timeline';
import Typography from 'antd/es/typography';
import ArrowLeftOutlined from '@ant-design/icons/es/icons/ArrowLeftOutlined';
import CheckCircleFilled from '@ant-design/icons/es/icons/CheckCircleFilled';
import EnvironmentOutlined from '@ant-design/icons/es/icons/EnvironmentOutlined';
import FileTextOutlined from '@ant-design/icons/es/icons/FileTextOutlined';
import FlagOutlined from '@ant-design/icons/es/icons/FlagOutlined';
import GlobalOutlined from '@ant-design/icons/es/icons/GlobalOutlined';
import LinkOutlined from '@ant-design/icons/es/icons/LinkOutlined';
import ScheduleOutlined from '@ant-design/icons/es/icons/ScheduleOutlined';
import ShareAltOutlined from '@ant-design/icons/es/icons/ShareAltOutlined';
import { Amount, Checkin, LevelTag, MaybeLine, StatusTag } from './Common.jsx';
import { makeCard } from './visitCard.js';
import { M, activePerson, manilaToday, peso, send, store, useApp, useFullData } from './shared.js';

const { Title, Paragraph, Text } = Typography;

function shrinkImage(file) {
  return new Promise((resolve) => {
    const img = new Image(); const url = URL.createObjectURL(file);
    img.onload = () => {
      const scale = Math.min(1, 1024 / Math.max(img.width, img.height));
      const c = document.createElement('canvas'); c.width = Math.round(img.width * scale); c.height = Math.round(img.height * scale);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url); resolve(c.toDataURL('image/jpeg', 0.75));
    };
    img.onerror = () => resolve(null);
    img.src = url;
  });
}

function ReportModal({ b, open, onClose }) {
  const { t, cfg } = useApp();
  const { msg: message } = useApp();
  const [form] = Form.useForm();
  const [busy, setBusy] = useState(false);
  const submit = async (vals) => {
    setBusy(true);
    const file = vals.photo && vals.photo[0];
    const photo = file ? await shrinkImage(file) : null;
    const status = await send(cfg.api, '/api/reports', { benefit_id: b.id, message: vals.what.trim().slice(0, 1000), contact: (vals.contact || '').trim().slice(0, 100) || null, photo, page: location.pathname });
    setBusy(false); form.resetFields(); onClose();
    message.success(status === 'sent' ? t('report_sent') : t('report_queued'));
  };
  return (
    <Modal open={open} onCancel={onClose} title={t('report_title')} footer={null} destroyOnHidden>
      <Form form={form} layout="vertical" id="report-form" onFinish={submit} requiredMark={false}>
        <Form.Item name="what" label={t('report_what')} rules={[{ required: true, whitespace: true, message: t('report_need') }]}>
          <Input.TextArea id="rep-what" maxLength={1000} rows={4} showCount />
        </Form.Item>
        <Form.Item name="photo" label={t('report_photo')} valuePropName="files" getValueFromEvent={(e) => Array.from(e.target.files || [])}>
          <input id="rep-photo" type="file" accept="image/*" />
        </Form.Item>
        <Form.Item name="contact" label={t('report_contact')}>
          <Input id="rep-contact" maxLength={100} autoComplete="off" />
        </Form.Item>
        <Button type="primary" htmlType="submit" block size="large" loading={busy}>{t('report_send')}</Button>
      </Form>
    </Modal>
  );
}

function VisitModal({ b, p, full, open, onClose }) {
  const app = useApp();
  const { t, L, officeById } = app;
  const { msg: message } = useApp();
  const today = useMemo(manilaToday, []);
  const office = officeById(b.office) || (full && full.offices.find((o) => o.id === b.office));
  const others = useMemo(() => (full ? full.benefits.filter((x) => {
    if (x.id === b.id || x.office !== b.office) return false;
    if (!p) return M.appliesToCity(x, 'calamba');
    const res = M.evaluate(x, p, today); return res.fit !== 'no' && !res.missing.length;
  }) : []), [full, b, p, today]);
  const [bundle, setBundle] = useState(false);
  const [withName, setWithName] = useState(false);
  const [img, setImg] = useState(null);
  const [blob, setBlob] = useState(null);
  const draw = useMemo(() => makeCard({ ...app, peso, siteHost: app.cfg.site || location.host }), [app]);
  useEffect(() => {
    if (!open) return;
    const chosen = bundle ? [b].concat(others) : [b];
    let url;
    draw(chosen, office, withName && p ? p.name : '', p).then((bl) => { setBlob(bl); url = URL.createObjectURL(bl); setImg(url); });
    const visits = store.get('visits', []);
    chosen.forEach((x) => { if (!visits.some((v) => v.id === x.id && !v.answered)) visits.push({ id: x.id, at: today, city: (p && p.city) || 'calamba' }); });
    store.set('visits', visits.slice(-30));
    return () => { if (url) URL.revokeObjectURL(url); };
  }, [open, bundle, withName, draw]); // eslint-disable-line react-hooks/exhaustive-deps

  const save = () => {
    if (!blob) return;
    try { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'benepisyo-' + b.id + '.png'; document.body.appendChild(a); a.click(); a.remove(); message.success(t('plan_saved')); }
    catch (e) { message.info(t('plan_hold')); }
  };
  const share = () => {
    if (!blob) return;
    let file; try { file = new File([blob], 'benepisyo-' + b.id + '.png', { type: 'image/png' }); } catch (e) { file = null; }
    if (file && navigator.canShare && navigator.canShare({ files: [file] })) navigator.share({ files: [file], title: L(b.title) }).catch(() => {});
    else message.info(t('plan_hold'));
  };
  return (
    <Modal open={open} onCancel={onClose} title={t('plan_title')} footer={null} destroyOnHidden closable={{ id: 'sheet-close' }}>
      <Space direction="vertical" size="middle" style={{ width: '100%' }}>
        {others.length > 0 && !bundle && (
          <Alert id="bundle" type="info" showIcon message={t('plan_bundle', { n: others.length, office: L(office.name) })}
            action={<Button size="small" type="primary" id="bundle-yes" onClick={() => setBundle(true)}>{t('plan_bundle_yes')}</Button>} />
        )}
        {p && !p.self && p.name && <Checkbox id="card-name" checked={withName} onChange={(e) => setWithName(e.target.checked)}>{t('plan_name')}</Checkbox>}
        {img ? <img className="card-preview" id="card-img" src={img} alt={t('plan_title') + ': ' + L(b.title)} /> : <div className="card-preview placeholder" />}
        <Flex gap={8} wrap>
          <Button type="primary" id="card-save" onClick={save}>{t('plan_save')}</Button>
          <Button id="card-share" icon={<ShareAltOutlined />} onClick={share}>{t('plan_share')}</Button>
        </Flex>
        <Text type="secondary">{t('plan_hold')}</Text>
      </Space>
    </Modal>
  );
}

function WhyBox({ b, p, today }) {
  const { t, cityName, docName, subj } = useApp();
  const res = M.evaluate(b, p, today);
  if (res.fit === 'no') return null;
  const c = p.city ? cityName(p.city) : p.cityLabel;
  const items = res.why.map((w) => {
    const [k, v] = w.split(':');
    if (k === 'group') return t('why_group_' + v);
    if (k === 'age') return t('why_age', { n: v });
    if (k === 'resident') return t('why_resident', { city: c });
    if (k === 'income') return t('why_income_' + v);
    if (['milestone', 'no_pension', 'employed', 'four_ps', 'not_four_ps', 'children', 'lost_job'].includes(k)) return t('why_' + k);
    return null;
  }).filter(Boolean);
  (p.docs || []).forEach((d) => { if ((b.needs || []).some((g) => g.includes(d))) items.push(t('why_has', { doc: docName(d) })); });
  return (
    <Alert className="why-box" type="success" showIcon
      message={<b>{p.self ? t('detail_why') : t('detail_why_other', { subj: subj(p) })}</b>}
      description={<><ul>{items.map((i) => <li key={i}>{i}</li>)}</ul><MaybeLine res={res} /></>} />
  );
}

export default function Detail({ b, city, office }) {
  const { t, L, link, fmtDate, cfg } = useApp();
  const { msg: message } = useApp();
  const st = M.effectiveStatus(b, cfg.today);
  const [p, setP] = useState(null);
  const [today, setToday] = useState(cfg.today);
  const [report, setReport] = useState(false);
  const [visit, setVisit] = useState(false);
  const [count, setCount] = useState(0);
  const full = useFullData(cfg.root);
  useEffect(() => { setP(activePerson()); setToday(manilaToday()); }, []);
  useEffect(() => {
    if (!cfg.api) return;
    fetch(cfg.api.replace(/\/$/, '') + '/api/counts?ids=' + encodeURIComponent(b.id)).then((r) => (r.ok ? r.json() : null))
      .then((j) => { const n = j && j.counts && j.counts[b.id]; if (n) setCount(n); }).catch(() => {});
  }, [b.id, cfg.api]);
  const has = (doc) => !!(p && doc && doc.split('|').some((d) => (p.docs || []).includes(d)));
  const mapUrl = office && office.map_query ? 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(office.map_query) : null;
  const shareIt = () => {
    const url = location.href;
    if (navigator.share) { navigator.share({ title: L(b.title), text: L(b.title) + ' – Benepisyo', url }).catch(() => {}); return; }
    if (navigator.clipboard) navigator.clipboard.writeText(url).then(() => message.success(t('share_copied')), () => message.info(url));
    else message.info(url);
  };

  return (
    <Flex vertical gap={16} className="detail" data-benefit={b.id}>
      {full && <Checkin fullData={full} today={today} />}
      <nav className="crumbs" aria-label="Breadcrumb"><a href={link(city.id + '/')}><ArrowLeftOutlined /> {t('city_page_title', { city: city.name })}</a></nav>
      <Card>
        <Flex vertical gap={8}>
          <Flex gap={6} wrap><LevelTag b={b} /><Tag>{t('kind_' + b.kind)}</Tag></Flex>
          <Title level={1} style={{ margin: 0 }}>{L(b.title)}</Title>
          <Amount b={b} size="lg" />
          <Text type="secondary">{L(b.frequency)}</Text>
          <Flex gap={6} wrap align="center">
            <StatusTag b={b} today={cfg.today} />
            <Text type="secondary">{t('checked', { date: fmtDate(b.verification.checked_on) })}</Text>
            {count > 0 && <Text type="secondary" id="checkin-count">· {t('checkin_count', { n: count })}</Text>}
          </Flex>
          {st === 'outdated' && <Alert type="error" showIcon message={t('outdated_warn')} />}
          {st === 'reported' && <Alert type="warning" showIcon message={t('reported_warn') + (b.verification.method ? ' ' + L(b.verification.method) : '')} />}
          {b.expires_on && <Alert type="warning" showIcon message={t('ends_on', { date: fmtDate(b.expires_on) })} />}
          {b.no_apply && <Alert type="info" showIcon message={t('no_apply')} />}
          <Paragraph style={{ marginBottom: 0 }}>{L(b.summary)}</Paragraph>
        </Flex>
      </Card>
      {p && <WhyBox b={b} p={p} today={today} />}
      <Card title={t('detail_who')}><Paragraph style={{ margin: 0 }}>{L(b.who)}</Paragraph></Card>
      <Card title={<><FileTextOutlined /> {t('detail_bring')}</>}>
        <List id="checklist" split={false} dataSource={b.requirements} renderItem={(r, i) => {
          const ok = has(r.doc);
          return (
            <List.Item key={i} data-doc={r.doc || ''} className={ok ? 'have' : ''} style={{ padding: '6px 0' }}>
              <Flex gap={10} align="flex-start">
                {ok ? <CheckCircleFilled className="tick on" /> : <span className="tick" aria-hidden="true" />}
                <span>{L(r)}{r.note && <Text type="secondary" className="req-note"> {L(r.note)}</Text>}{ok && <Text type="success" className="have-label"> · {t('detail_have')}</Text>}</span>
              </Flex>
            </List.Item>
          );
        }} />
        {b.free && <Space direction="vertical" style={{ marginTop: 12 }}><Tag color="gold" className="free-stamp">{t('card_free')}</Tag><Text>{t('detail_free_more')}{b.free_note ? ' ' + L(b.free_note) : ''}</Text></Space>}
      </Card>
      <Card title={<><EnvironmentOutlined /> {t('detail_where')}</>} className="office">
        <Paragraph strong style={{ marginBottom: 4 }}>{L(office.name)}</Paragraph>
        <Paragraph type="secondary">{L(office.place)}</Paragraph>
        <Flex gap={8} wrap>
          {mapUrl && <Button icon={<EnvironmentOutlined />} href={mapUrl} target="_blank" rel="noopener">{t('map')}</Button>}
          {office.web && <Button icon={<GlobalOutlined />} href={office.web} target="_blank" rel="noopener">{t('website')}</Button>}
        </Flex>
      </Card>
      <Card title={<><ScheduleOutlined /> {t('detail_how')}</>}>
        <Steps direction="vertical" size="small" current={-1} items={b.steps.map((s) => ({ status: 'process', title: <span className="step-text">{L(s)}</span> }))} />
      </Card>
      <Card title={<><LinkOutlined /> {t('detail_source')}</>}>
        <List size="small" split={false} dataSource={b.sources} renderItem={(s) => <List.Item style={{ padding: '4px 0' }}><a href={s.url} rel="noopener" target="_blank">{s.label}</a></List.Item>} />
        <Paragraph type="secondary" style={{ marginTop: 8 }}>{L(b.verification.method)}</Paragraph>
        {(b.history || []).length > 0 && <>
          <Title level={5}>{t('detail_history')}</Title>
          <Timeline items={(b.history || []).slice().sort((x, y) => (x.date < y.date ? 1 : -1)).map((h) => ({ children: <><Text strong>{fmtDate(h.date)}</Text>: {L(h)}</> }))} />
        </>}
      </Card>
      <div className="sticky-cta">
        <Button type="primary" size="large" id="plan-visit" icon={<FileTextOutlined />} onClick={() => setVisit(true)}>{t('plan_visit')}</Button>
        <Button size="large" id="share-btn" icon={<ShareAltOutlined />} onClick={shareIt}>{t('share')}</Button>
        <Button type="link" id="report-btn" icon={<FlagOutlined />} onClick={() => setReport(true)}>{t('report_btn')}</Button>
      </div>
      <ReportModal b={b} open={report} onClose={() => setReport(false)} />
      {visit && <VisitModal b={b} p={p} full={full} open={visit} onClose={() => setVisit(false)} />}
    </Flex>
  );
}
