import React, { useEffect, useMemo, useState } from 'react';
import Alert from 'antd/es/alert';
import Button from 'antd/es/button';
import ConfigProvider from 'antd/es/config-provider';
import Flex from 'antd/es/flex';
import Typography from 'antd/es/typography';
import message from 'antd/es/message';
import theme from 'antd/es/theme';
import TranslationOutlined from '@ant-design/icons/es/icons/TranslationOutlined';
import WifiOutlined from '@ant-design/icons/es/icons/WifiOutlined';
import { Ctx, flushOutbox, makeHelpers, store } from './shared.js';


export const TOKENS = {
  colorPrimary: '#0b5d4e',
  colorInfo: '#0b5d4e',
  borderRadius: 10,
  fontSize: 16,
  controlHeight: 44,
  controlHeightLG: 52,
  fontFamily: '"Atkinson Hyperlegible", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif'
};

function useDark() {
  const [dark, setDark] = useState(false);
  useEffect(() => {
    if (!window.matchMedia) return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const on = () => setDark(mq.matches);
    on();
    mq.addEventListener ? mq.addEventListener('change', on) : mq.addListener(on);
    return () => (mq.removeEventListener ? mq.removeEventListener('change', on) : mq.removeListener(on));
  }, []);
  return dark;
}

function Frame({ active, children }) {
  const app = React.useContext(Ctx);
  const { t, link, cfg, data, setLang, lang } = app;
  const { token } = theme.useToken();
  const [offline, setOffline] = useState(false);
  useEffect(() => {
    const net = () => { setOffline(navigator.onLine === false); if (navigator.onLine) flushOutbox(cfg.api); };
    window.addEventListener('online', net); window.addEventListener('offline', net); net();
    return () => { window.removeEventListener('online', net); window.removeEventListener('offline', net); };
  }, [cfg.api]);
  useEffect(() => { document.documentElement.style.background = token.colorBgLayout; }, [token.colorBgLayout]);
  const nav = [['', 'nav_family', 'home'], ['calamba/', 'nav_city', 'city'], ['tungkol/', 'nav_about', 'about']];
  return (
    <div className="bp-layout" style={{ minHeight: '100vh', background: token.colorBgLayout, color: token.colorText }}>
      {offline && <Alert id="offline" banner type="warning" icon={<WifiOutlined />} message={t('offline')} />}
      <header className="bp-head" style={{ background: token.colorPrimary }}>
        <div className="wrap bp-head-row">
          <a className="brand" href={link('')}>
            <b>Benepisyo<span>.</span></b>
            <small>{t('brand_tag')}</small>
          </a>
          <Button id="lang-toggle" ghost icon={<TranslationOutlined />} onClick={() => setLang(lang === 'en' ? 'tl' : 'en')}>{t('lang_switch')}</Button>
        </div>
      </header>
      <nav className="bp-nav" aria-label="Main" style={{ background: token.colorBgContainer, borderBottom: '1px solid ' + token.colorBorderSecondary }}>
        <Flex className="wrap" gap={4} wrap>
          {nav.map(([p, k, id]) => (
            <Button key={id} type={active === id ? 'primary' : 'text'} href={link(p)} aria-current={active === id ? 'page' : undefined}>{t(k)}</Button>
          ))}
        </Flex>
      </nav>
      <main id="main" className="wrap bp-main">{children}</main>
      <footer className="bp-foot">
        <div className="wrap">
          <Typography.Paragraph strong>{t('footer_disclaimer')}</Typography.Paragraph>
          <Typography.Paragraph type="secondary">{t('footer_privacy')}</Typography.Paragraph>
          <Typography.Text type="secondary"><a href={link('tungkol/')}>{t('nav_about')}</a> · Data {data.meta.data_version}</Typography.Text>
        </div>
      </footer>
    </div>
  );
}

/* Root wrapper: theme, language, helpers. Server and browser render the same first frame (Tagalog, light). */
export function Root({ cfg, data, active, children }) {
  const [lang, setLangState] = useState('tl');
  const dark = useDark();
  useEffect(() => { if (store.get('lang', 'tl') === 'en') setLangState('en'); }, []);
  useEffect(() => { document.documentElement.lang = lang === 'en' ? 'en' : 'tl'; document.documentElement.setAttribute('data-lang', lang); }, [lang]);
  const setLang = (l) => { store.set('lang', l); setLangState(l); };
  const [msg, holder] = message.useMessage({ top: 72, maxCount: 2 });
  const value = useMemo(() => ({ ...makeHelpers(cfg, lang, data), setLang, msg }), [cfg, lang, data, msg]);
  return (
    <ConfigProvider
      theme={{
        algorithm: dark ? theme.darkAlgorithm : theme.defaultAlgorithm,
        token: dark ? { ...TOKENS, colorPrimary: '#3fb99c', colorInfo: '#3fb99c', colorLink: '#5fd0b3' } : TOKENS,
        components: { Card: { headerFontSize: 17 } }
      }}
    >
      {holder}
      <Ctx.Provider value={value}>
        <Frame active={active}>{children}</Frame>
      </Ctx.Provider>
    </ConfigProvider>
  );
}
