import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, BackHandler, Platform, Pressable, ScrollView, View, useColorScheme } from 'react-native';
import { Text } from './src/i18n';
import type { ScrollViewInstance } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { AppData, emptyData, load, save } from './src/store';
import { Route, ScreenProps } from './src/nav';
import { ThemeCtx, dark, light } from './src/ui';
import { Home, NewCourse, Premium, Settings } from './src/screens/Home';
import { Course } from './src/screens/Course';
import { AddWords } from './src/screens/AddWords';
import { Lesson, Result } from './src/screens/Lesson';
import { Inventory } from './src/screens/Inventory';
import { RawText, setUi } from './src/i18n';
import { alreadyTried, applyUpdate, checkForUpdate, onAppVisible } from './src/update';

export default function App() {
  const scheme = useColorScheme();
  const theme = scheme === 'dark' ? dark : light;
  const [data, setData] = useState<AppData | null>(null);
  const [stack, setStack] = useState<Route[]>([{ name: 'home' }]);
  const scroll = useRef<ScrollViewInstance>(null);

  useEffect(() => {
    load().then(setData);
  }, []);

  const update = useCallback((fn: (d: AppData) => AppData) => {
    setData((d) => {
      const next = fn(d ?? emptyData());
      save(next);
      return next;
    });
  }, []);

  const go = useCallback((r: Route) => setStack((s) => [...s, r]), []);
  const replace = useCallback((r: Route) => setStack((s) => [...s.slice(0, -1), r]), []);
  const back = useCallback(() => setStack((s) => (s.length > 1 ? s.slice(0, -1) : s)), []);

  const route = stack[stack.length - 1];
  if (data) setUi(data.ui ?? 'de');

  // Auto-Update für die Web-App (z. B. vom iPhone-Homebildschirm)
  const [newVersion, setNewVersion] = useState<string | null>(null);
  const routeRef = useRef(route.name);
  routeRef.current = route.name;
  useEffect(() => {
    const check = async () => {
      const v = await checkForUpdate();
      if (!v) return;
      // Auf der Startseite sofort neu laden, sonst Hinweis zeigen (z. B. mitten in einer Lektion)
      if (routeRef.current === 'home' && !alreadyTried(v)) applyUpdate(v);
      else setNewVersion(v);
    };
    check();
    return onAppVisible(check);
  }, []);

  useEffect(() => {
    scroll.current?.scrollTo({ y: 0, animated: false });
  }, [route]);

  useEffect(() => {
    if (Platform.OS !== 'android') return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (stack.length > 1) {
        back();
        return true;
      }
      return false;
    });
    return () => sub.remove();
  }, [stack.length, back]);

  let screen: React.ReactNode = <ActivityIndicator color={theme.primary} style={{ marginTop: 80 }} />;
  if (data && !data.ui) {
    screen = (
      <View style={{ flex: 1, justifyContent: 'center', gap: 14, paddingVertical: 60 }}>
        <RawText style={{ color: theme.ink, fontSize: 34, fontWeight: '800', textAlign: 'center' }}>Vokabula</RawText>
        <RawText style={{ color: theme.muted, fontSize: 16, textAlign: 'center', marginBottom: 12 }}>Sprache wählen · Choose your language</RawText>
        {(['de', 'en'] as const).map((l) => (
          <Pressable key={l} accessibilityRole="button" onPress={() => update((d) => ({ ...d, ui: l }))} style={{ backgroundColor: theme.primary, borderRadius: 14, minHeight: 56, alignItems: 'center', justifyContent: 'center' }}>
            <RawText style={{ color: theme.onPrimary, fontSize: 18, fontWeight: '800' }}>{l === 'de' ? 'Deutsch' : 'English'}</RawText>
          </Pressable>
        ))}
      </View>
    );
  } else if (data) {
    const p: ScreenProps = { data, update, go, replace, back };
    switch (route.name) {
      case 'home': screen = <Home {...p} />; break;
      case 'newCourse': screen = <NewCourse {...p} />; break;
      case 'settings': screen = <Settings {...p} />; break;
      case 'inventory': screen = <Inventory {...p} />; break;
      case 'premium': screen = <Premium {...p} reason={route.reason} />; break;
      case 'course': screen = <Course {...p} id={route.id} tab={route.tab} sec={route.sec} />; break;
      case 'add': screen = <AddWords key={route.id} {...p} id={route.id} />; break;
      case 'lesson': screen = <Lesson key={stack.length} {...p} id={route.id} node={route.node} practice={route.practice} />; break;
      case 'result': screen = <Result {...p} {...route} />; break;
    }
  }

  return (
    <SafeAreaProvider>
      <ThemeCtx.Provider value={theme}>
        <Root route={route} bg={theme.bg}>
          <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
          {newVersion && (
            <Pressable
              accessibilityRole="button"
              onPress={() => applyUpdate(newVersion)}
              style={{ backgroundColor: theme.card, paddingHorizontal: 16, paddingVertical: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 }}
            >
              <Text style={{ color: theme.onCard, fontWeight: '700', fontSize: 14 }}>Neue Version verfügbar</Text>
              <Text style={{ color: theme.onCard, fontWeight: '900', fontSize: 14, textDecorationLine: 'underline' }}>Aktualisieren</Text>
            </Pressable>
          )}
          {route.name === 'course' && data?.ui ? (
            // Kursseite hat eigene Scrollfläche und untere Navigationsleiste
            screen
          ) : (
            <ScrollView key={data?.ui} ref={scroll} contentContainerStyle={{ flexGrow: 1, alignItems: 'center' }} keyboardShouldPersistTaps="handled">
              <View style={{ width: '100%', maxWidth: 620, paddingHorizontal: 20, paddingTop: 12, paddingBottom: 40, flexGrow: 1 }}>
                {screen}
              </View>
            </ScrollView>
          )}
        </Root>
      </ThemeCtx.Provider>
    </SafeAreaProvider>
  );
}

// Kursseite im Web: Ränder direkt per CSS env(), die Tab-Leiste soll bis ganz unten reichen.
// Alle anderen Bildschirme nutzen den normalen SafeAreaView.
function Root({ route, bg, children }: { route: Route; bg: string; children: React.ReactNode }) {
  if (route.name === 'course' && Platform.OS === 'web') {
    // fixed + alle Ränder 0: füllt auf dem iPhone immer den ganzen Bildschirm, egal wie hoch #root ist
    const style: any = {
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: bg,
      paddingTop: 'env(safe-area-inset-top)',
      paddingLeft: 'env(safe-area-inset-left)',
      paddingRight: 'env(safe-area-inset-right)',
    };
    return <View style={style}>{children}</View>;
  }
  return (
    <SafeAreaView edges={route.name === 'course' ? ['top', 'left', 'right'] : undefined} style={{ flex: 1, backgroundColor: bg }}>
      {children}
    </SafeAreaView>
  );
}
