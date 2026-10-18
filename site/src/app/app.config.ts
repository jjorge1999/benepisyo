import { ApplicationConfig, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideRouter, withComponentInputBinding, withInMemoryScrolling } from '@angular/router';
import { provideClientHydration, withEventReplay } from '@angular/platform-browser';
import { provideNzIcons } from 'ng-zorro-antd/icon';
import { provideNzI18n, en_US } from 'ng-zorro-antd/i18n';
import {
  AimOutline, ArrowLeftOutline, ArrowRightOutline, BorderOutline, CheckCircleFill, CheckCircleOutline, CheckSquareFill, ClockCircleOutline,
  CloseOutline, EditOutline, EnvironmentOutline, ExclamationCircleFill, ExclamationCircleOutline, FileTextOutline, FlagOutline, GlobalOutline,
  InfoCircleFill, InfoCircleOutline, LinkOutline, LeftOutline, PlusOutline, RightOutline, ScheduleOutline, SearchOutline, ShareAltOutline,
  TeamOutline, TranslationOutline, UnlockOutline, UserOutline, CloseCircleFill, CloseCircleOutline, LoadingOutline, CheckOutline, DoubleLeftOutline, DoubleRightOutline
} from '@ant-design/icons-angular/icons';
import { routes } from './app.routes';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes, withComponentInputBinding(), withInMemoryScrolling({ scrollPositionRestoration: 'top' })),
    provideClientHydration(withEventReplay()),
    provideNzI18n(en_US),
    provideNzIcons([
      AimOutline, ArrowLeftOutline, ArrowRightOutline, BorderOutline, CheckCircleFill, CheckCircleOutline, CheckSquareFill, ClockCircleOutline,
      CloseOutline, EditOutline, EnvironmentOutline, ExclamationCircleFill, ExclamationCircleOutline, FileTextOutline, FlagOutline, GlobalOutline,
      InfoCircleFill, InfoCircleOutline, LinkOutline, LeftOutline, PlusOutline, RightOutline, ScheduleOutline, SearchOutline, ShareAltOutline,
      TeamOutline, TranslationOutline, UnlockOutline, UserOutline, CloseCircleFill, CloseCircleOutline, LoadingOutline, CheckOutline, DoubleLeftOutline, DoubleRightOutline
    ])
  ]
};
