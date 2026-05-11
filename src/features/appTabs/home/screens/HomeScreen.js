import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Image,
  ScrollView,
  StatusBar,
} from 'react-native';
import { useAuth } from '../../../auth/services/AuthContext';

const QuickActionCard = ({ icon, label, color, onPress }) => (
  <TouchableOpacity
    onPress={onPress}
    style={{
      flex: 1,
      backgroundColor: color + '12',
      borderRadius: 16,
      padding: 16,
      alignItems: 'center',
      borderWidth: 1.5,
      borderColor: color + '30',
      marginHorizontal: 4,
    }}
    activeOpacity={0.75}
  >
    <View
      style={{
        width: 48,
        height: 48,
        borderRadius: 14,
        backgroundColor: color + '20',
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 8,
      }}
    >
      <Text style={{ fontSize: 22 }}>{icon}</Text>
    </View>
    <Text
      style={{
        fontSize: 11,
        fontWeight: '700',
        color: color,
        textAlign: 'center',
        textTransform: 'uppercase',
        letterSpacing: 0.5,
      }}
    >
      {label}
    </Text>
  </TouchableOpacity>
);

const StatBadge = ({ value, label, color }) => (
  <View
    style={{
      flex: 1,
      alignItems: 'center',
      paddingVertical: 12,
      borderRightWidth: 1,
      borderRightColor: '#EEF2FF',
    }}
  >
    <Text style={{ fontSize: 22, fontWeight: '800', color }}>{value}</Text>
    <Text
      style={{
        fontSize: 11,
        color: '#94A3B8',
        marginTop: 2,
        fontWeight: '500',
      }}
    >
      {label}
    </Text>
  </View>
);

const AlertRow = ({ color, icon, text, time }) => (
  <View
    style={{
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 10,
      borderBottomWidth: 1,
      borderBottomColor: '#F1F5F9',
    }}
  >
    <View
      style={{
        width: 36,
        height: 36,
        borderRadius: 10,
        backgroundColor: color + '18',
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: 12,
      }}
    >
      <Text style={{ fontSize: 16 }}>{icon}</Text>
    </View>
    <Text
      style={{ flex: 1, fontSize: 13, color: '#334155', fontWeight: '500' }}
    >
      {text}
    </Text>
    <Text style={{ fontSize: 11, color: '#94A3B8' }}>{time}</Text>
  </View>
);

export default function HomeScreen() {
  const { user, logout } = useAuth();

  const greeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good Morning';
    if (hour < 17) return 'Good Afternoon';
    return 'Good Evening';
  };

  const today = new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });

  return (
    <View style={{ flex: 1, backgroundColor: '#F0F4FF' }}>
      <StatusBar barStyle="light-content" backgroundColor="#10B981" />

      {/* Header */}
      <View
        style={{
          backgroundColor: '#10B981',
          paddingTop: 52,
          paddingBottom: 28,
          paddingHorizontal: 20,
          borderBottomLeftRadius: 28,
          borderBottomRightRadius: 28,
        }}
      >
        {/* Top Row */}
        <View
          style={{
            flexDirection: 'row',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
          }}
        >
          <View style={{ flex: 1 }}>
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                marginBottom: 4,
              }}
            >
              <View
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: 4,
                  backgroundColor: '#4ADE80',
                  marginRight: 6,
                }}
              />
              <Text
                style={{
                  color: '#93C5FD',
                  fontSize: 12,
                  fontWeight: '600',
                  letterSpacing: 1,
                  textTransform: 'uppercase',
                }}
              >
                System Active
              </Text>
            </View>
            <Text
              style={{
                color: 'rgba(255,255,255,0.7)',
                fontSize: 13,
                marginBottom: 2,
              }}
            >
              {greeting()},
            </Text>
            <Text
              style={{
                color: '#FFFFFF',
                fontSize: 22,
                fontWeight: '800',
                letterSpacing: 0.3,
              }}
            >
              {user?.displayName?.split(' ')[0] || 'Doctor'}
            </Text>
            <Text style={{ color: '#93C5FD', fontSize: 12, marginTop: 2 }}>
              {today}
            </Text>
          </View>

          <View style={{ alignItems: 'center' }}>
            {user?.photoURL ? (
              <Image
                source={{ uri: user.photoURL }}
                style={{
                  width: 54,
                  height: 54,
                  borderRadius: 27,
                  borderWidth: 2.5,
                  borderColor: '#FFFFFF40',
                }}
              />
            ) : (
              <View
                style={{
                  width: 54,
                  height: 54,
                  borderRadius: 27,
                  backgroundColor: 'rgba(255,255,255,0.15)',
                  alignItems: 'center',
                  justifyContent: 'center',
                  borderWidth: 2,
                  borderColor: 'rgba(255,255,255,0.25)',
                }}
              >
                <Text style={{ fontSize: 22 }}>👤</Text>
              </View>
            )}
            <View
              style={{
                marginTop: 6,
                backgroundColor: 'rgba(255,255,255,0.15)',
                paddingHorizontal: 8,
                paddingVertical: 3,
                borderRadius: 20,
              }}
            >
              <Text
                style={{ color: '#E0F2FE', fontSize: 10, fontWeight: '700' }}
              >
                MD · User
              </Text>
            </View>
          </View>
        </View>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ padding: 16, paddingBottom: 32 }}
      >
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <TouchableOpacity
            style={{
              flex: 1,
              backgroundColor: '#1A56DB',
              borderRadius: 14,
              paddingVertical: 14,
              alignItems: 'center',
              flexDirection: 'row',
              justifyContent: 'center',
            }}
            activeOpacity={0.8}
          >
            <Text style={{ fontSize: 16, marginRight: 6 }}>📝</Text>
            <Text style={{ color: '#FFFFFF', fontWeight: '800', fontSize: 13 }}>
              New Note
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={logout}
            style={{
              backgroundColor: '#F1F5F9',
              borderRadius: 14,
              paddingVertical: 14,
              paddingHorizontal: 18,
              alignItems: 'center',
              justifyContent: 'center',
            }}
            activeOpacity={0.8}
          >
            <Text style={{ fontSize: 16 }}>🚪</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </View>
  );
}
